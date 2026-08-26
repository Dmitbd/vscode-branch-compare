import type { CancellationToken } from 'vscode';
import { describe, expect, test, vi, type Mocked } from 'vitest';
import type { ChangedFile, ComparisonResult, ComparisonSelection } from '../../src/domain/model';
import { GitCommandCancelledError, GitCommandError } from '../../src/git/commandRunner';
import type { GitAdapter } from '../../src/git/gitAdapter';
import {
  ComparisonService,
  IdenticalSelectionError,
  MissingRefError,
  NoCommonAncestorError,
} from '../../src/compare/comparisonService';

const root = '/repo';
const baseSha = 'a'.repeat(40);
const compareSha = 'b'.repeat(40);
const mergeBaseSha = 'c'.repeat(40);
const selection: ComparisonSelection = {
  repositoryUri: 'file:///repo',
  baseRef: 'refs/heads/develop',
  compareRef: 'refs/heads/feature',
};

function createAdapter(): Mocked<GitAdapter> {
  return {
    listRefs: vi.fn(),
    findRemoteHead: vi.fn(),
    resolveCommit: vi.fn(),
    findMergeBase: vi.fn(),
    listChangedFiles: vi.fn(),
    listTreePaths: vi.fn(),
    readBlob: vi.fn(),
    getBlobSize: vi.fn(),
    fetch: vi.fn(),
  };
}

function arrangeSuccessfulComparison(adapter: Mocked<GitAdapter>, files: readonly ChangedFile[] = []) {
  adapter.resolveCommit
    .mockResolvedValueOnce(baseSha)
    .mockResolvedValueOnce(compareSha);
  adapter.findMergeBase.mockResolvedValue(mergeBaseSha);
  adapter.listChangedFiles.mockResolvedValue(files);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('ComparisonService', () => {
  test('loads sorted deeply immutable paths without changing raw Unicode identity', async () => {
    const adapter = createAdapter();
    const token = { isCancellationRequested: false } as CancellationToken;
    const result: ComparisonResult = {
      selection,
      baseSha,
      compareSha,
      mergeBaseSha,
      files: [],
      summary: { files: 0, additions: 0, deletions: 0 },
    };
    adapter.listTreePaths
      .mockResolvedValueOnce(['z10.txt', 'e\u0301clair.txt', 'z2.txt'])
      .mockResolvedValueOnce(['src/z10.ts', 'src/z2.ts', 'README.md']);

    const trees = await new ComparisonService(adapter).loadCompleteTree(root, result, token);

    expect(adapter.listTreePaths).toHaveBeenNthCalledWith(1, root, mergeBaseSha, token);
    expect(adapter.listTreePaths).toHaveBeenNthCalledWith(2, root, compareSha, token);
    expect(trees).toEqual({
      mergeBasePaths: ['e\u0301clair.txt', 'z2.txt', 'z10.txt'],
      comparePaths: ['README.md', 'src/z2.ts', 'src/z10.ts'],
    });
    expect(Object.isFrozen(trees)).toBe(true);
    expect(Object.isFrozen(trees.mergeBasePaths)).toBe(true);
    expect(Object.isFrozen(trees.comparePaths)).toBe(true);
    expect(() => (trees.mergeBasePaths as string[]).push('other.txt')).toThrow();
  });

  test('keeps canonically equivalent Git paths as two distinct tree entries', async () => {
    const adapter = createAdapter();
    const result: ComparisonResult = {
      selection,
      baseSha,
      compareSha,
      mergeBaseSha,
      files: [],
      summary: { files: 0, additions: 0, deletions: 0 },
    };
    adapter.listTreePaths
      .mockResolvedValueOnce(['e\u0301clair.txt', 'éclair.txt'])
      .mockResolvedValueOnce([]);

    await expect(new ComparisonService(adapter).loadCompleteTree(root, result)).resolves.toEqual({
      mergeBasePaths: ['e\u0301clair.txt', 'éclair.txt'],
      comparePaths: [],
    });
  });

  test('resolves refs in order and lists only merge-base to compare changes', async () => {
    const adapter = createAdapter();
    const token = { isCancellationRequested: false } as CancellationToken;
    arrangeSuccessfulComparison(adapter);

    await new ComparisonService(adapter).compare(root, selection, token);

    expect(adapter.resolveCommit).toHaveBeenNthCalledWith(1, root, 'refs/heads/develop', token);
    expect(adapter.resolveCommit).toHaveBeenNthCalledWith(2, root, 'refs/heads/feature', token);
    expect(adapter.findMergeBase).toHaveBeenCalledWith(root, baseSha, compareSha, token);
    expect(adapter.listChangedFiles).toHaveBeenCalledWith(root, mergeBaseSha, compareSha, token);
  });

  test('summarizes numeric line changes while binary files contribute only to file count', async () => {
    const adapter = createAdapter();
    arrangeSuccessfulComparison(adapter, [
      { status: 'added', oldPath: undefined, newPath: 'src/new.ts', lineChanges: { additions: 12, deletions: 0 } },
      { status: 'modified', oldPath: 'assets/logo.png', newPath: 'assets/logo.png', lineChanges: { additions: null, deletions: null } },
      { status: 'deleted', oldPath: 'src/old.ts', newPath: undefined, lineChanges: { additions: 0, deletions: 7 } },
    ]);

    const result = await new ComparisonService(adapter).compare(root, selection);

    expect(result.summary).toEqual({ files: 3, additions: 12, deletions: 7 });
    expect(Object.isFrozen(result.summary)).toBe(true);
  });

  test('rejects the same ref without calling Git', async () => {
    const adapter = createAdapter();
    const sameRefSelection = { ...selection, compareRef: selection.baseRef };

    await expect(new ComparisonService(adapter).compare(root, sameRefSelection))
      .rejects.toBeInstanceOf(IdenticalSelectionError);
    expect(adapter.resolveCommit).not.toHaveBeenCalled();
  });

  test('rejects different refs that resolve to the same commit', async () => {
    const adapter = createAdapter();
    adapter.resolveCommit.mockResolvedValue(baseSha);

    await expect(new ComparisonService(adapter).compare(root, selection))
      .rejects.toBeInstanceOf(IdenticalSelectionError);
    expect(adapter.findMergeBase).not.toHaveBeenCalled();
  });

  test('maps a ref that disappeared during comparison to a domain error', async () => {
    const adapter = createAdapter();
    const cause = new GitCommandError(128, 'unknown revision');
    adapter.resolveCommit.mockRejectedValue(cause);

    await expect(new ComparisonService(adapter).compare(root, selection))
      .rejects.toMatchObject<Partial<MissingRefError>>({
        name: 'MissingRefError',
        ref: selection.baseRef,
        cause,
      });
  });

  test('preserves unexpected Git failures while resolving a ref', async () => {
    const adapter = createAdapter();
    const cause = new GitCommandError(null, 'git executable unavailable');
    adapter.resolveCommit.mockRejectedValue(cause);

    await expect(new ComparisonService(adapter).compare(root, selection)).rejects.toBe(cause);
  });

  test('rejects histories without a common ancestor', async () => {
    const adapter = createAdapter();
    adapter.resolveCommit.mockImplementation(async (_root, ref) => (
      ref === selection.baseRef ? baseSha : compareSha
    ));
    adapter.findMergeBase.mockResolvedValue(undefined);

    await expect(new ComparisonService(adapter).compare(root, selection))
      .rejects.toBeInstanceOf(NoCommonAncestorError);
    await expect(new ComparisonService(adapter).compare(root, selection))
      .rejects.toBeInstanceOf(NoCommonAncestorError);
    expect(adapter.listChangedFiles).not.toHaveBeenCalled();
    expect(adapter.findMergeBase).toHaveBeenCalledTimes(2);
  });

  test('does not start work for an already cancelled comparison', async () => {
    const adapter = createAdapter();
    const token = { isCancellationRequested: true } as CancellationToken;

    await expect(new ComparisonService(adapter).compare(root, selection, token))
      .rejects.toBeInstanceOf(GitCommandCancelledError);
    expect(adapter.resolveCommit).not.toHaveBeenCalled();
  });

  test('propagates cancellation and retries cancelled cached work', async () => {
    const adapter = createAdapter();
    const cancellation = new GitCommandCancelledError();
    adapter.resolveCommit
      .mockResolvedValueOnce(baseSha)
      .mockResolvedValueOnce(compareSha)
      .mockResolvedValueOnce(baseSha)
      .mockResolvedValueOnce(compareSha);
    adapter.findMergeBase.mockResolvedValue(mergeBaseSha);
    adapter.listChangedFiles
      .mockRejectedValueOnce(cancellation)
      .mockResolvedValueOnce([]);
    const service = new ComparisonService(adapter);

    await expect(service.compare(root, selection)).rejects.toBe(cancellation);
    await expect(service.compare(root, selection)).resolves.toBeDefined();

    expect(adapter.listChangedFiles).toHaveBeenCalledTimes(2);
  });

  test('returns a deeply immutable result ordered by normalized display path', async () => {
    const adapter = createAdapter();
    const files: readonly ChangedFile[] = [
      { status: 'deleted', oldPath: 'zeta.txt', newPath: undefined },
      { status: 'renamed', oldPath: 'old.txt', newPath: 'e\u0301clair.txt' },
      { status: 'added', oldPath: undefined, newPath: 'alpha.txt' },
    ];
    arrangeSuccessfulComparison(adapter, files);

    const result = await new ComparisonService(adapter).compare(root, selection);

    expect(result.files.map((file) => file.newPath ?? file.oldPath)).toEqual([
      'alpha.txt',
      'e\u0301clair.txt',
      'zeta.txt',
    ]);
    expect(result).toEqual({
      selection,
      baseSha,
      compareSha,
      mergeBaseSha,
      files: result.files,
      summary: { files: 3, additions: 0, deletions: 0 },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.selection)).toBe(true);
    expect(Object.isFrozen(result.files)).toBe(true);
    expect(Object.isFrozen(result.summary)).toBe(true);
    expect(result.files.every(Object.isFrozen)).toBe(true);
    expect(() => (result.files as ChangedFile[]).push(files[0])).toThrow();
  });

  test('reuses fulfilled comparison data while returning the current ref selection', async () => {
    const adapter = createAdapter();
    adapter.resolveCommit.mockImplementation(async (_root, ref) => (
      ref === selection.compareRef ? compareSha : baseSha
    ));
    adapter.findMergeBase.mockResolvedValue(mergeBaseSha);
    adapter.listChangedFiles.mockResolvedValue([]);
    const service = new ComparisonService(adapter);
    const aliasSelection = { ...selection, baseRef: 'refs/heads/main' };
    const shortSelection = { ...selection, baseRef: 'main' };

    const first = await service.compare(root, shortSelection);
    const second = await service.compare(root, aliasSelection);

    expect(first.selection).toEqual(shortSelection);
    expect(second.selection).toEqual(aliasSelection);
    expect(second).not.toBe(first);
    expect(adapter.resolveCommit).toHaveBeenCalledTimes(4);
    expect(adapter.findMergeBase).toHaveBeenCalledTimes(1);
    expect(adapter.listChangedFiles).toHaveBeenCalledTimes(1);
  });

  test('does not let one caller cancellation reject a concurrent caller', async () => {
    const adapter = createAdapter();
    const firstFilesStarted = deferred<void>();
    const firstFiles = deferred<readonly ChangedFile[]>();
    const tokenState = { isCancellationRequested: false };
    const firstToken = tokenState as CancellationToken;
    adapter.resolveCommit.mockImplementation(async (_root, ref) => (
      ref === selection.baseRef ? baseSha : compareSha
    ));
    adapter.findMergeBase.mockResolvedValue(mergeBaseSha);
    adapter.listChangedFiles.mockImplementationOnce(() => {
      firstFilesStarted.resolve();
      return firstFiles.promise;
    });
    adapter.listChangedFiles.mockResolvedValueOnce([]);
    const service = new ComparisonService(adapter);

    const first = service.compare(root, selection, firstToken);
    await firstFilesStarted.promise;
    tokenState.isCancellationRequested = true;
    const second = service.compare(root, selection);
    await vi.waitFor(() => expect(adapter.resolveCommit).toHaveBeenCalledTimes(4));
    await Promise.resolve();
    await Promise.resolve();
    firstFiles.resolve([]);

    await expect(first).rejects.toBeInstanceOf(GitCommandCancelledError);
    await expect(second).resolves.toMatchObject({ selection });
    expect(adapter.listChangedFiles).toHaveBeenCalledTimes(2);
  });

  test('evicts the oldest result when the cache exceeds 16 entries', async () => {
    const adapter = createAdapter();
    adapter.resolveCommit.mockImplementation(async (_root, ref) => (
      ref === selection.baseRef ? baseSha : compareSha
    ));
    adapter.findMergeBase.mockResolvedValue(mergeBaseSha);
    adapter.listChangedFiles.mockResolvedValue([]);
    const service = new ComparisonService(adapter);

    for (let index = 0; index < 17; index += 1) {
      await service.compare(root, { ...selection, repositoryUri: `file:///repo-${index}` });
    }
    await service.compare(root, { ...selection, repositoryUri: 'file:///repo-0' });

    expect(adapter.listChangedFiles).toHaveBeenCalledTimes(18);
  });
});
