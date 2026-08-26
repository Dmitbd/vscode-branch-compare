import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('vscode', () => {
  class Uri {
    public readonly scheme: string;
    public readonly authority: string;
    public readonly path: string;
    public readonly query: string;
    public readonly fragment: string;

    public constructor(parts: {
      scheme: string;
      authority?: string;
      path?: string;
      query?: string;
      fragment?: string;
    }) {
      this.scheme = parts.scheme;
      this.authority = parts.authority ?? '';
      this.path = parts.path ?? '';
      this.query = parts.query ?? '';
      this.fragment = parts.fragment ?? '';
    }

    public static from(parts: ConstructorParameters<typeof Uri>[0]): Uri {
      return new Uri(parts);
    }

    public toString(): string {
      const authority = this.authority ? `//${this.authority}` : '';
      const query = this.query ? `?${this.query}` : '';
      const fragment = this.fragment ? `#${this.fragment}` : '';
      return `${this.scheme}:${authority}${this.path}${query}${fragment}`;
    }
  }

  return {
    Uri,
    commands: { executeCommand: vi.fn(async () => undefined) },
  };
});

import { commands } from 'vscode';
import type { ChangedFile, ComparisonResult, DiffTarget } from '../../src/domain/model';
import type { GitAdapter } from '../../src/git/gitAdapter';
import type { RepositorySnapshot } from '../../src/repositories/repositoryProvider';
import {
  BinaryBlobError,
  BlobTooLargeError,
  GitContentProvider,
  UnknownRepositoryError,
  openFullDiff,
} from '../../src/content/gitContentProvider';
import { BRANCH_COMPARE_SCHEME, createVirtualUri, parseVirtualUri } from '../../src/content/virtualUri';

const repositoryId = '0123456789abcdef';
const mergeBaseSha = 'a'.repeat(40);
const compareSha = 'b'.repeat(40);
const root = '/workspace/project';

const repository = {
  id: repositoryId,
  rootUri: { fsPath: root },
  currentBranch: 'feature/x',
  remotes: ['origin'],
} as RepositorySnapshot;

const result: ComparisonResult = {
  selection: {
    repositoryUri: 'file:///workspace/project',
    baseRef: 'refs/remotes/origin/main',
    compareRef: 'refs/heads/feature/x',
  },
  baseSha: 'c'.repeat(40),
  compareSha,
  mergeBaseSha,
  files: [],
};

type BlobReader = Pick<GitAdapter, 'readBlob' | 'getBlobSize'>;

function gitAdapter(
  readBlob: GitAdapter['readBlob'],
  getBlobSize: GitAdapter['getBlobSize'] = async () => 0,
): BlobReader {
  return { readBlob, getBlobSize };
}

function provider(
  readBlob: GitAdapter['readBlob'],
  repositories: readonly RepositorySnapshot[] = [repository],
  getBlobSize?: GitAdapter['getBlobSize'],
) {
  return new GitContentProvider(gitAdapter(readBlob, getBlobSize), { repositories });
}

describe('GitContentProvider', () => {
  test('returns an empty side without resolving or reading Git content', async () => {
    const readBlob = vi.fn<GitAdapter['readBlob']>();
    const content = provider(readBlob, []).provideTextDocumentContent(createVirtualUri({
      repositoryId,
      commit: mergeBaseSha,
      path: 'added.txt',
      empty: true,
    }));

    await expect(content).resolves.toBe('');
    expect(readBlob).not.toHaveBeenCalled();
  });

  test('resolves a trusted repository root and decodes a text blob', async () => {
    const readBlob = vi.fn<GitAdapter['readBlob']>(async () => Buffer.from('hello 🚀'));
    const uri = createVirtualUri({ repositoryId, commit: compareSha, path: 'src/file?.ts', empty: false });

    await expect(provider(readBlob).provideTextDocumentContent(uri)).resolves.toBe('hello 🚀');
    expect(readBlob).toHaveBeenCalledWith(root, compareSha, 'src/file?.ts', undefined);
  });

  test('rejects unknown repository ids before Git access', async () => {
    const readBlob = vi.fn<GitAdapter['readBlob']>();
    const uri = createVirtualUri({
      repositoryId: 'fedcba9876543210',
      commit: compareSha,
      path: 'src/file.ts',
      empty: false,
    });

    await expect(provider(readBlob).provideTextDocumentContent(uri)).rejects.toBeInstanceOf(UnknownRepositoryError);
    expect(readBlob).not.toHaveBeenCalled();
  });

  test('rejects binary blobs containing a NUL byte', async () => {
    const readBlob = vi.fn<GitAdapter['readBlob']>(async () => Buffer.from([0x61, 0x00, 0x62]));
    const uri = createVirtualUri({ repositoryId, commit: compareSha, path: 'asset.bin', empty: false });

    await expect(provider(readBlob).provideTextDocumentContent(uri)).rejects.toEqual(new BinaryBlobError('asset.bin'));
  });

  test('rejects blobs larger than 10 MiB before decoding them', async () => {
    const byteLength = (10 * 1024 * 1024) + 1;
    const readBlob = vi.fn<GitAdapter['readBlob']>();
    const getBlobSize = vi.fn<GitAdapter['getBlobSize']>(async () => byteLength);
    const uri = createVirtualUri({ repositoryId, commit: compareSha, path: 'large.txt', empty: false });

    await expect(provider(readBlob, [repository], getBlobSize).provideTextDocumentContent(uri))
      .rejects.toEqual(new BlobTooLargeError(byteLength));
    expect(readBlob).not.toHaveBeenCalled();
  });

  test('keeps only the 32 most recently used decoded blobs', async () => {
    const readBlob = vi.fn<GitAdapter['readBlob']>(async (_root, _commit, path) => Buffer.from(path));
    const contentProvider = provider(readBlob);

    for (let index = 0; index < 33; index += 1) {
      await contentProvider.provideTextDocumentContent(createVirtualUri({
        repositoryId,
        commit: compareSha,
        path: `file-${index}.txt`,
        empty: false,
      }));
    }
    await contentProvider.provideTextDocumentContent(createVirtualUri({
      repositoryId,
      commit: compareSha,
      path: 'file-0.txt',
      empty: false,
    }));

    expect(readBlob).toHaveBeenCalledTimes(34);
  });
});

describe('openFullDiff', () => {
  beforeEach(() => {
    vi.mocked(commands.executeCommand).mockClear();
  });

  test.each<{
    status: ChangedFile['status'];
    file: ChangedFile;
    left: { commit: string; path: string; empty: boolean };
    right: { commit: string; path: string; empty: boolean };
    displayPath: string;
  }>([
    {
      status: 'modified',
      file: { status: 'modified', oldPath: 'src/same.ts', newPath: 'src/same.ts' },
      left: { commit: mergeBaseSha, path: 'src/same.ts', empty: false },
      right: { commit: compareSha, path: 'src/same.ts', empty: false },
      displayPath: 'src/same.ts',
    },
    {
      status: 'added',
      file: { status: 'added', oldPath: undefined, newPath: 'src/new.ts' },
      left: { commit: mergeBaseSha, path: 'src/new.ts', empty: true },
      right: { commit: compareSha, path: 'src/new.ts', empty: false },
      displayPath: 'src/new.ts',
    },
    {
      status: 'deleted',
      file: { status: 'deleted', oldPath: 'src/old.ts', newPath: undefined },
      left: { commit: mergeBaseSha, path: 'src/old.ts', empty: false },
      right: { commit: compareSha, path: 'src/old.ts', empty: true },
      displayPath: 'src/old.ts',
    },
    {
      status: 'renamed',
      file: { status: 'renamed', oldPath: 'src/before.ts', newPath: 'src/after.ts' },
      left: { commit: mergeBaseSha, path: 'src/before.ts', empty: false },
      right: { commit: compareSha, path: 'src/after.ts', empty: false },
      displayPath: 'src/after.ts',
    },
  ])('maps $status to two read-only branch-compare snapshots', async ({ file, left, right, displayPath }) => {
    await openFullDiff(repositoryId, result, { kind: 'changed', file }, 'origin/main', 'feature/x');

    expect(commands.executeCommand).toHaveBeenCalledOnce();
    const [command, leftUri, rightUri, title, options] = vi.mocked(commands.executeCommand).mock.calls[0];
    expect(command).toBe('vscode.diff');
    expect(leftUri).toMatchObject({ scheme: BRANCH_COMPARE_SCHEME });
    expect(rightUri).toMatchObject({ scheme: BRANCH_COMPARE_SCHEME });
    expect(parseVirtualUri(leftUri as never)).toEqual({ repositoryId, ...left });
    expect(parseVirtualUri(rightUri as never)).toEqual({ repositoryId, ...right });
    expect(title).toBe(`origin/main ↔ feature/x · ${displayPath}`);
    expect(options).toEqual({ preview: true });
  });

  test('opens unchanged paths from the merge-base and compared snapshots', async () => {
    const target: DiffTarget = { kind: 'unchanged', path: 'src/context.ts' };

    await openFullDiff(repositoryId, result, target, 'origin/main', 'feature/x');

    const [, leftUri, rightUri] = vi.mocked(commands.executeCommand).mock.calls[0];
    expect(parseVirtualUri(leftUri as never)).toEqual({
      repositoryId,
      commit: mergeBaseSha,
      path: 'src/context.ts',
      empty: false,
    });
    expect(parseVirtualUri(rightUri as never)).toEqual({
      repositoryId,
      commit: compareSha,
      path: 'src/context.ts',
      empty: false,
    });
  });

  test('preserves a decomposed Unicode Git path on both unchanged diff sides', async () => {
    const path = 'src/e\u0301clair.ts';

    await openFullDiff(repositoryId, result, { kind: 'unchanged', path }, 'origin/main', 'feature/x');

    const [, leftUri, rightUri] = vi.mocked(commands.executeCommand).mock.calls[0];
    expect(parseVirtualUri(leftUri as never).path).toBe(path);
    expect(parseVirtualUri(rightUri as never).path).toBe(path);
  });

  test('opens an invalid-byte renamed path by immutable blob OID without path argv', async () => {
    const oldBlobOid = '1'.repeat(40);
    const newBlobOid = '2'.repeat(40);
    const oldPathKey = Buffer.from([0x6f, 0x6c, 0x64, 0xff]).toString('base64url');
    const newPathKey = Buffer.from([0x6e, 0x65, 0x77, 0xfe]).toString('base64url');
    await openFullDiff(repositoryId, result, { kind: 'changed', file: {
      status: 'renamed', oldPath: 'old\\xFF', newPath: 'new\\xFE',
      oldPathKey, newPathKey, oldBlobOid, newBlobOid,
    } }, 'origin/main', 'feature/x');
    const [, leftUri, rightUri] = vi.mocked(commands.executeCommand).mock.calls[0];
    const readBlobObject = vi.fn(async (_root: string, oid: string) => Buffer.from(oid === oldBlobOid ? 'old' : 'new'));
    const contentProvider = new GitContentProvider({
      readBlob: vi.fn(), getBlobSize: vi.fn(), readBlobObject,
      getBlobObjectSize: vi.fn(async () => 3),
    }, { repositories: [repository] });

    await expect(contentProvider.provideTextDocumentContent(leftUri as never)).resolves.toBe('old');
    await expect(contentProvider.provideTextDocumentContent(rightUri as never)).resolves.toBe('new');
    expect(readBlobObject).toHaveBeenNthCalledWith(1, root, oldBlobOid, undefined);
    expect(readBlobObject).toHaveBeenNthCalledWith(2, root, newBlobOid, undefined);
  });

  test('refuses a changed gitlink before creating content URIs or reading the commit as a blob', async () => {
    await expect(openFullDiff(repositoryId, result, { kind: 'changed', file: {
      status: 'modified', oldPath: 'submodule', newPath: 'submodule',
      oldPathKey: Buffer.from('submodule').toString('base64url'),
      newPathKey: Buffer.from('submodule').toString('base64url'),
      oldBlobOid: '1'.repeat(40), newBlobOid: '2'.repeat(40),
      oldObjectKind: 'gitlink', newObjectKind: 'gitlink',
    } }, 'origin/main', 'feature/x')).rejects.toThrow('Submodule changes cannot be previewed');
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });
});
