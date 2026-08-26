import { describe, expect, test, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn(async () => undefined) },
  Uri: class Uri {},
}));

import {
  CompareController,
  type CompareControllerUi,
  type ControllerCancellationTokenSource,
  type ControllerDependencies,
  type RefPickItem,
  type RepositoryPickItem,
} from '../../src/controller/compareController';
import type {
  ComparisonResult,
  ComparisonSelection,
  CompleteTreePaths,
  GitRef,
} from '../../src/domain/model';
import type { GitAdapter } from '../../src/git/gitAdapter';
import type { RepositorySnapshot } from '../../src/repositories/repositoryProvider';
import { buildTreeModel, type TreeModelInput } from '../../src/tree/treeModel';
import { MissingRefError, NoCommonAncestorError } from '../../src/compare/comparisonService';
import { technicalErrorText, toUserFacingError } from '../../src/errors/userFacingError';

const localFeature: GitRef = {
  fullName: 'refs/heads/feature/x', displayName: 'feature/x', kind: 'local', commit: 'b'.repeat(40),
};
const localMain: GitRef = {
  fullName: 'refs/heads/main', displayName: 'main', kind: 'local', commit: 'a'.repeat(40),
};
const remoteMain: GitRef = {
  fullName: 'refs/remotes/origin/main', displayName: 'origin/main', kind: 'remote', remote: 'origin', commit: 'a'.repeat(40),
};
const remoteDevelop: GitRef = {
  fullName: 'refs/remotes/upstream/develop', displayName: 'upstream/develop', kind: 'remote', remote: 'upstream', commit: 'c'.repeat(40),
};

function repository(id = 'repo-1', currentBranch = 'feature/x', remotes = ['origin']): RepositorySnapshot {
  return {
    id,
    rootUri: {
      fsPath: `/workspace/${id}`,
      toString: () => `file:///workspace/${id}`,
    },
    currentBranch,
    remotes,
  } as unknown as RepositorySnapshot;
}

function comparison(selection: ComparisonSelection, marker = 'result'): ComparisonResult {
  return {
    selection,
    baseSha: 'a'.repeat(40),
    compareSha: 'b'.repeat(40),
    mergeBaseSha: marker === 'result' ? 'c'.repeat(40) : 'd'.repeat(40),
    files: [{ status: 'modified', oldPath: `${marker}.ts`, newPath: `${marker}.ts` }],
    summary: { files: 1, additions: 0, deletions: 0 },
  };
}

const completeTree: CompleteTreePaths = Object.freeze({
  mergeBasePaths: Object.freeze(['README.md', 'result.ts']),
  comparePaths: Object.freeze(['README.md', 'result.ts', 'src/context.ts']),
});

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(options?: {
  repositories?: RepositorySnapshot[];
  refs?: GitRef[];
  remoteHead?: string;
  openDiff?: ControllerDependencies['openDiff'];
}) {
  const repositories = options?.repositories ?? [repository()];
  const refs = options?.refs ?? [localFeature, localMain, remoteMain, remoteDevelop];
  const treeInputs: unknown[] = [];
  const saved: ComparisonSelection[] = [];
  const refPicks: RefPickItem[][] = [];
  const repositoryPicks: RepositoryPickItem[][] = [];
  let nextRef: GitRef | undefined;
  let nextRepository: RepositorySnapshot | undefined;

  const adapter = {
    listRefs: vi.fn(async () => refs),
    findRemoteHead: vi.fn(async () => options?.remoteHead),
    fetch: vi.fn(async () => undefined),
  } as unknown as GitAdapter;
  const compare = vi.fn(async (_root: string, selection: ComparisonSelection) => comparison(selection));
  const loadCompleteTree = vi.fn(async () => completeTree);
  const save = vi.fn(async (_id: string, selection: ComparisonSelection) => { saved.push(selection); });
  const ui: CompareControllerUi = {
    pickRepository: vi.fn(async (items) => {
      repositoryPicks.push([...items]);
      return nextRepository;
    }),
    pickRef: vi.fn(async (items) => {
      refPicks.push([...items]);
      return nextRef;
    }),
    withProgress: vi.fn(async (_title, task) => task()),
    showError: vi.fn(async () => undefined),
  };
  const deps: ControllerDependencies = {
    repositories: { get repositories() { return repositories; } },
    git: adapter,
    comparisonService: { compare, loadCompleteTree },
    selectionStore: {
      load: vi.fn(async () => undefined),
      save,
    },
    tree: { setInput: vi.fn((input) => treeInputs.push(input)) },
    ui,
    output: { appendLine: vi.fn(), show: vi.fn() },
    createCancellationTokenSource: () => cancellationSource(),
    openDiff: options?.openDiff,
  };
  return {
    adapter, compare, loadCompleteTree, save, deps, refs, repositories, treeInputs, saved, refPicks,
    repositoryPicks,
    lastInput() { return treeInputs.at(-1) as Record<string, unknown>; },
    setNextRef(value: GitRef | undefined) { nextRef = value; },
    setNextRepository(value: RepositorySnapshot | undefined) { nextRepository = value; },
  };
}

describe('CompareController', () => {
  test('selects the only repository without a picker and initializes compare from the current branch', async () => {
    const h = harness({ remoteHead: remoteMain.fullName });
    const controller = new CompareController(h.deps);

    await controller.initialize();

    expect(h.repositoryPicks).toHaveLength(0);
    expect(h.compare).toHaveBeenCalledWith('/workspace/repo-1', {
      repositoryUri: 'file:///workspace/repo-1',
      baseRef: remoteMain.fullName,
      compareRef: localFeature.fullName,
    }, expect.anything());
  });

  test('shows the repository picker only when more than one repository exists', async () => {
    const second = repository('repo-2');
    const h = harness({ repositories: [repository(), second], remoteHead: remoteMain.fullName });
    h.setNextRepository(second);
    const controller = new CompareController(h.deps);

    await controller.initialize();

    expect(h.repositoryPicks).toHaveLength(1);
    expect(h.repositoryPicks[0].map((item) => item.repository.id)).toEqual(['repo-1', 'repo-2']);
  });

  test('labels local and remote refs in the searchable branch picker', async () => {
    const h = harness({ remoteHead: remoteMain.fullName });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    h.setNextRef(remoteDevelop);

    await controller.selectBase();

    expect(h.refPicks.at(-1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'feature/x', description: 'Local branch', ref: localFeature }),
      expect.objectContaining({ label: 'upstream/develop', description: 'Remote branch · upstream', ref: remoteDevelop }),
    ]));
  });

  test('falls back from the preferred remote HEAD to remote then local conventional branches', async () => {
    const h = harness({
      refs: [localFeature, localMain, remoteDevelop],
      remoteHead: undefined,
    });
    const controller = new CompareController(h.deps);

    await controller.initialize();

    expect(h.adapter.findRemoteHead).toHaveBeenCalledWith('/workspace/repo-1', 'origin', expect.anything());
    expect(h.compare).toHaveBeenCalledWith('/workspace/repo-1', expect.objectContaining({
      baseRef: localMain.fullName,
      compareRef: localFeature.fullName,
    }), expect.anything());
  });

  test('never applies an older comparison after a newer selection completes', async () => {
    const first = deferred<ComparisonResult>();
    const h = harness({ remoteHead: remoteMain.fullName });
    h.compare.mockImplementationOnce(async (_root, selection) => first.promise)
      .mockImplementationOnce(async (_root, selection) => comparison(selection, 'new'));
    const controller = new CompareController(h.deps);
    const initializing = controller.initialize();
    await vi.waitFor(() => expect(h.compare).toHaveBeenCalledTimes(1));
    h.setNextRef(remoteDevelop);

    await controller.selectBase();
    first.resolve(comparison(h.compare.mock.calls[0][1], 'old'));
    await initializing;

    const appliedResults = h.treeInputs
      .map((input) => (input as { result?: ComparisonResult }).result)
      .filter(Boolean);
    expect(appliedResults.at(-1)?.files[0]?.newPath).toBe('new.ts');
    expect(appliedResults.some((result) => result?.files[0]?.newPath === 'old.ts')).toBe(false);
  });

  test('refresh never fetches, while fetch updates only selected remotes', async () => {
    const h = harness({ refs: [localFeature, remoteMain, remoteDevelop], remoteHead: remoteMain.fullName });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    h.setNextRef(remoteDevelop);
    await controller.selectBase();

    await controller.refresh();
    expect(h.adapter.fetch).not.toHaveBeenCalled();

    await controller.fetch();
    expect(h.adapter.fetch.mock.calls.map((call) => call[1])).toEqual(['upstream']);
  });

  test('loads the complete tree lazily once and reuses it when toggled back on', async () => {
    const h = harness({ remoteHead: remoteMain.fullName });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const latestResult = h.lastInput().result as ComparisonResult;

    await controller.toggleUnchanged();

    expect(h.loadCompleteTree).toHaveBeenCalledWith(
      '/workspace/repo-1',
      latestResult,
      expect.anything(),
    );
    expect(h.lastInput()).toMatchObject({ showUnchanged: true, completeTree });

    await controller.toggleUnchanged();
    expect(h.loadCompleteTree).toHaveBeenCalledTimes(1);
    expect(h.lastInput()).toMatchObject({ showUnchanged: false });

    await controller.toggleUnchanged();
    expect(h.loadCompleteTree).toHaveBeenCalledTimes(1);
    expect(h.lastInput()).toMatchObject({ showUnchanged: true, completeTree });
  });

  test('cancels and ignores complete-tree loading superseded by a branch selection', async () => {
    const pendingTree = deferred<CompleteTreePaths>();
    const h = harness({ remoteHead: remoteMain.fullName });
    h.loadCompleteTree.mockImplementationOnce(async () => pendingTree.promise);
    const controller = new CompareController(h.deps);
    await controller.initialize();

    const loadingTree = controller.toggleUnchanged();
    await vi.waitFor(() => expect(h.loadCompleteTree).toHaveBeenCalledOnce());
    const treeToken = h.loadCompleteTree.mock.calls[0][2];
    h.setNextRef(remoteDevelop);
    await controller.selectBase();

    expect(treeToken?.isCancellationRequested).toBe(true);
    pendingTree.resolve(completeTree);
    await loadingTree;
    expect(h.lastInput()).toMatchObject({
      showUnchanged: false,
      completeTree: undefined,
      selection: { baseRef: remoteDevelop.fullName },
    });
  });

  test('keeps the previous comparison visible while a local refresh is loading', async () => {
    const pendingComparison = deferred<ComparisonResult>();
    const h = harness({ remoteHead: remoteMain.fullName });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const previousResult = h.lastInput().result as ComparisonResult;
    h.compare.mockImplementationOnce(async () => pendingComparison.promise);

    const refreshing = controller.refresh();
    await vi.waitFor(() => expect(h.compare).toHaveBeenCalledTimes(2));

    expect(h.lastInput()).toMatchObject({ loading: true, result: previousResult });
    pendingComparison.resolve(previousResult);
    await refreshing;
  });

  test.each(['refresh', 'fetch'] as const)(
    'does not let an unchanged-files toggle cancel a delayed %s comparison',
    async (action) => {
      const pendingComparison = deferred<ComparisonResult>();
      const h = harness({ remoteHead: remoteMain.fullName });
      const controller = new CompareController(h.deps);
      await controller.initialize();
      h.compare.mockImplementationOnce(async () => pendingComparison.promise);

      const runningComparison = controller[action]();
      await vi.waitFor(() => expect(h.compare).toHaveBeenCalledTimes(2));
      const comparisonToken = h.compare.mock.calls[1][2];
      const loadingGeneration = h.lastInput().comparisonGeneration;

      await controller.toggleUnchanged();

      expect(comparisonToken?.isCancellationRequested).toBe(false);
      expect(h.loadCompleteTree).not.toHaveBeenCalled();
      expect(h.lastInput()).toMatchObject({
        loading: true,
        comparisonGeneration: loadingGeneration,
      });

      const appliedResult = comparison(h.compare.mock.calls[1][1], 'new');
      pendingComparison.resolve(appliedResult);
      await runningComparison;
      expect(h.lastInput()).toMatchObject({ loading: false, result: appliedResult });
    },
  );

  test('restarts a cancelled complete-tree load after a same-SHA local refresh', async () => {
    const pendingTree = deferred<CompleteTreePaths>();
    const h = harness({ remoteHead: remoteMain.fullName });
    h.loadCompleteTree.mockImplementationOnce(async () => pendingTree.promise);
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const previousResult = h.lastInput().result as ComparisonResult;

    const loadingTree = controller.toggleUnchanged();
    await vi.waitFor(() => expect(h.loadCompleteTree).toHaveBeenCalledOnce());
    const oldTreeToken = h.loadCompleteTree.mock.calls[0][2];

    const refreshing = controller.refresh();
    await vi.waitFor(() => expect(h.loadCompleteTree).toHaveBeenCalledTimes(2));
    await refreshing;

    expect(oldTreeToken?.isCancellationRequested).toBe(true);
    expect(h.loadCompleteTree.mock.calls[1]).toEqual([
      '/workspace/repo-1',
      previousResult,
      expect.anything(),
    ]);
    const resumedTreeToken = h.loadCompleteTree.mock.calls[1][2];
    expect(resumedTreeToken).not.toBe(oldTreeToken);
    expect(resumedTreeToken?.isCancellationRequested).toBe(false);
    expect(h.lastInput()).toMatchObject({
      showUnchanged: true,
      completeTree,
      completeTreeLoading: false,
      loading: false,
    });

    pendingTree.resolve({ mergeBasePaths: ['stale.txt'], comparePaths: ['stale.txt'] });
    await loadingTree;
    expect(h.lastInput()).toMatchObject({ showUnchanged: true, completeTree });
  });

  test('preserves complete-tree intent across overlapping same-SHA local refreshes', async () => {
    const pendingTree = deferred<CompleteTreePaths>();
    const firstRefreshResult = deferred<ComparisonResult>();
    const secondRefreshResult = deferred<ComparisonResult>();
    const h = harness({ remoteHead: remoteMain.fullName });
    h.loadCompleteTree.mockImplementationOnce(async () => pendingTree.promise);
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const previousResult = h.lastInput().result as ComparisonResult;
    h.compare
      .mockImplementationOnce(async () => firstRefreshResult.promise)
      .mockImplementationOnce(async () => secondRefreshResult.promise);

    const initialTreeLoad = controller.toggleUnchanged();
    await vi.waitFor(() => expect(h.loadCompleteTree).toHaveBeenCalledOnce());
    const initialTreeToken = h.loadCompleteTree.mock.calls[0][2];

    const firstRefresh = controller.refresh();
    await vi.waitFor(() => expect(h.compare).toHaveBeenCalledTimes(2));
    const firstRefreshToken = h.compare.mock.calls[1][2];

    const secondRefresh = controller.refresh();
    await vi.waitFor(() => expect(h.compare).toHaveBeenCalledTimes(3));
    const secondRefreshToken = h.compare.mock.calls[2][2];

    expect(initialTreeToken?.isCancellationRequested).toBe(true);
    expect(firstRefreshToken?.isCancellationRequested).toBe(true);
    expect(secondRefreshToken?.isCancellationRequested).toBe(false);

    secondRefreshResult.resolve(previousResult);
    await vi.waitFor(() => expect(h.loadCompleteTree).toHaveBeenCalledTimes(2));
    await secondRefresh;

    expect(h.loadCompleteTree.mock.calls[1][2]).toBe(secondRefreshToken);
    expect(h.lastInput()).toMatchObject({
      result: previousResult,
      showUnchanged: true,
      completeTree,
      completeTreeLoading: false,
      loading: false,
    });

    firstRefreshResult.resolve(comparison(h.compare.mock.calls[1][1], 'new'));
    pendingTree.resolve({ mergeBasePaths: ['stale.txt'], comparePaths: ['stale.txt'] });
    await Promise.all([firstRefresh, initialTreeLoad]);

    expect(h.loadCompleteTree).toHaveBeenCalledTimes(2);
    expect(h.lastInput()).toMatchObject({
      result: previousResult,
      showUnchanged: true,
      completeTree,
      completeTreeLoading: false,
      loading: false,
    });
    const finalInput = h.lastInput();
    expect(
      finalInput.showUnchanged === true
        && finalInput.completeTree === undefined
        && finalInput.completeTreeLoading === false
        && finalInput.loading === false,
    ).toBe(false);
  });

  test('does not restart a cancelled complete-tree load after a changed-SHA local refresh', async () => {
    const pendingTree = deferred<CompleteTreePaths>();
    const h = harness({ remoteHead: remoteMain.fullName });
    h.loadCompleteTree.mockImplementationOnce(async () => pendingTree.promise);
    const controller = new CompareController(h.deps);
    await controller.initialize();

    const loadingTree = controller.toggleUnchanged();
    await vi.waitFor(() => expect(h.loadCompleteTree).toHaveBeenCalledOnce());
    const oldTreeToken = h.loadCompleteTree.mock.calls[0][2];
    h.compare.mockImplementationOnce(async (_root, selection) => comparison(selection, 'new'));

    await controller.refresh();

    expect(oldTreeToken?.isCancellationRequested).toBe(true);
    expect(h.loadCompleteTree).toHaveBeenCalledTimes(1);
    expect(h.lastInput()).toMatchObject({
      showUnchanged: false,
      completeTree: undefined,
      completeTreeLoading: false,
      loading: false,
    });
    pendingTree.resolve({ mergeBasePaths: ['stale.txt'], comparePaths: ['stale.txt'] });
    await loadingTree;
    expect(h.lastInput()).toMatchObject({ showUnchanged: false, completeTree: undefined });
  });

  test('preserves a loaded complete tree only when local refresh resolves to identical SHAs', async () => {
    const h = harness({ remoteHead: remoteMain.fullName });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    await controller.toggleUnchanged();

    await controller.refresh();

    expect(h.loadCompleteTree).toHaveBeenCalledTimes(1);
    expect(h.lastInput()).toMatchObject({ showUnchanged: true, completeTree });

    h.compare.mockImplementationOnce(async (_root, selection) => comparison(selection, 'new'));
    await controller.refresh();

    expect(h.lastInput()).toMatchObject({ showUnchanged: false, completeTree: undefined });
  });

  test('clears a pending complete-tree request after a final comparison error', async () => {
    const pendingTree = deferred<CompleteTreePaths>();
    const h = harness({ remoteHead: remoteMain.fullName });
    h.loadCompleteTree.mockImplementationOnce(async () => pendingTree.promise);
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const loadingTree = controller.toggleUnchanged();
    await vi.waitFor(() => expect(h.loadCompleteTree).toHaveBeenCalledOnce());
    const oldTreeToken = h.loadCompleteTree.mock.calls[0][2];
    h.compare.mockRejectedValueOnce(new Error('comparison exploded'));

    await controller.refresh();

    expect(oldTreeToken?.isCancellationRequested).toBe(true);
    expect(h.lastInput()).toMatchObject({
      result: undefined,
      completeTree: undefined,
      showUnchanged: false,
      completeTreeLoading: false,
      loading: false,
      error: expect.objectContaining({ message: 'Unable to compare branches' }),
    });
    pendingTree.resolve({ mergeBasePaths: ['stale.txt'], comparePaths: ['stale.txt'] });
    await loadingTree;
    expect(h.lastInput()).toMatchObject({ result: undefined, completeTree: undefined });
  });

  test('falls back to changed rows with a concise retryable complete-tree error', async () => {
    const h = harness({ remoteHead: remoteMain.fullName });
    h.loadCompleteTree.mockRejectedValueOnce(new Error('ls-tree exploded'));
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const latestResult = h.lastInput().result;

    await controller.toggleUnchanged();

    expect(h.lastInput()).toMatchObject({
      result: latestResult,
      showUnchanged: false,
      completeTree: undefined,
      completeTreeLoading: false,
      completeTreeError: expect.objectContaining({
        message: 'Unable to load all files; try again',
      }),
    });
    expect(h.deps.output.appendLine).toHaveBeenCalledWith(expect.stringContaining('ls-tree exploded'));
    const viewModel = buildTreeModel(h.lastInput() as unknown as TreeModelInput);
    expect(viewModel).toMatchObject({
      completeTreeError: 'Unable to load all files; try again',
      canRetryCompleteTree: true,
      error: undefined,
    });
    expect(viewModel.nodes).not.toHaveLength(0);
    expect(JSON.stringify(viewModel)).not.toContain('ls-tree exploded');

    await controller.toggleUnchanged();
    expect(h.loadCompleteTree).toHaveBeenCalledTimes(2);
    expect(h.lastInput()).toMatchObject({
      showUnchanged: true,
      completeTree,
      completeTreeError: undefined,
    });
  });

  test('keeps the previous comparison visible when fetch fails before recomputation', async () => {
    const h = harness({ remoteHead: remoteMain.fullName });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const previousResult = h.lastInput().result;
    h.adapter.fetch.mockRejectedValueOnce(new Error('network unavailable'));

    await controller.fetch();

    expect(h.lastInput()).toMatchObject({
      result: previousResult,
      loading: false,
      error: undefined,
    });
    expect(h.deps.ui.showError).toHaveBeenCalledWith(
      'Fetch failed; the previous comparison is still shown',
      'Show Output',
    );
  });

  test('fetches the default remote when both selected refs are local', async () => {
    const localDevelop = { ...localMain, fullName: 'refs/heads/develop', displayName: 'develop' };
    const h = harness({ refs: [localFeature, localDevelop], remoteHead: undefined });
    const controller = new CompareController(h.deps);
    await controller.initialize();

    await controller.fetch();

    expect(h.adapter.fetch).toHaveBeenCalledWith('/workspace/repo-1', 'origin', expect.anything());
  });

  test('swap exchanges refs, persists the selection, and recomputes', async () => {
    const h = harness({ remoteHead: remoteMain.fullName });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    await controller.toggleUnchanged();

    await controller.swap();

    expect(h.saved.at(-1)).toEqual({
      repositoryUri: 'file:///workspace/repo-1',
      baseRef: localFeature.fullName,
      compareRef: remoteMain.fullName,
    });
    expect(h.compare).toHaveBeenLastCalledWith('/workspace/repo-1', h.saved.at(-1), expect.anything());
    expect(h.lastInput()).toMatchObject({ showUnchanged: false, completeTree: undefined });
  });

  test('keeps the first manual branch choice until the second completes an initially incomplete selection', async () => {
    const release = { ...localMain, fullName: 'refs/heads/release', displayName: 'release' };
    const h = harness({
      repositories: [repository('repo-1', '', [])],
      refs: [release, localFeature],
      remoteHead: undefined,
    });
    const controller = new CompareController(h.deps);

    await controller.initialize();
    h.setNextRef(release);
    await controller.selectBase();

    expect(h.compare).not.toHaveBeenCalled();
    expect(h.saved).toHaveLength(0);

    h.setNextRef(localFeature);
    await controller.selectCompare();

    expect(h.saved).toEqual([{
      repositoryUri: 'file:///workspace/repo-1',
      baseRef: release.fullName,
      compareRef: localFeature.fullName,
    }]);
    expect(h.compare).toHaveBeenCalledWith('/workspace/repo-1', h.saved[0], expect.anything());
  });

  test('rejects an open-diff payload from an earlier comparison generation', async () => {
    const openDiff = vi.fn(async () => undefined);
    const h = harness({ remoteHead: remoteMain.fullName, openDiff });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const staleInput = h.treeInputs.at(-1) as { result: ComparisonResult; comparisonGeneration: number };
    h.setNextRef(remoteDevelop);
    await controller.selectBase();

    await controller.openDiff({ kind: 'changed', file: staleInput.result.files[0] }, staleInput.comparisonGeneration);

    expect(openDiff).not.toHaveBeenCalled();
  });

  test('invalidates an old diff before awaiting selection persistence', async () => {
    const openDiff = vi.fn(async () => undefined);
    const persistence = deferred<void>();
    const h = harness({ remoteHead: remoteMain.fullName, openDiff });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const staleInput = h.treeInputs.at(-1) as { result: ComparisonResult; comparisonGeneration: number };
    h.save.mockImplementationOnce(async () => persistence.promise);
    h.setNextRef(remoteDevelop);

    const selecting = controller.selectBase();
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    await controller.openDiff({ kind: 'changed', file: staleInput.result.files[0] }, staleInput.comparisonGeneration);

    expect(openDiff).not.toHaveBeenCalled();
    persistence.resolve(undefined);
    await selecting;
  });

  test('clears a closed selected repository without reopening the multi-repository picker', async () => {
    const first = repository('repo-1');
    const second = repository('repo-2');
    const third = repository('repo-3');
    const openDiff = vi.fn(async () => undefined);
    const h = harness({ repositories: [first, second, third], remoteHead: remoteMain.fullName, openDiff });
    h.setNextRepository(first);
    const controller = new CompareController(h.deps);
    await controller.initialize();
    const staleInput = h.treeInputs.at(-1) as { result: ComparisonResult; comparisonGeneration: number };

    h.repositories.splice(0, 1);
    await controller.repositoriesChanged();

    expect(h.repositoryPicks).toHaveLength(1);
    expect(h.treeInputs.at(-1)).toMatchObject({
      repositories: [second, third],
      repository: undefined,
      selection: undefined,
      result: undefined,
    });
    await controller.openDiff({ kind: 'changed', file: staleInput.result.files[0] }, staleInput.comparisonGeneration);
    expect(openDiff).not.toHaveBeenCalled();
  });

  test('opens an unchanged target only from the current comparison generation', async () => {
    const openDiff = vi.fn(async () => undefined);
    const h = harness({ remoteHead: remoteMain.fullName, openDiff });
    const controller = new CompareController(h.deps);
    await controller.initialize();
    await controller.toggleUnchanged();
    const currentInput = h.treeInputs.at(-1) as { result: ComparisonResult; comparisonGeneration: number };
    const target = { kind: 'unchanged' as const, path: 'src/context.ts' };

    await controller.openDiff(target, currentInput.comparisonGeneration - 1);
    expect(openDiff).not.toHaveBeenCalled();

    await controller.openDiff(target, currentInput.comparisonGeneration);

    expect(openDiff).toHaveBeenCalledWith(
      'repo-1',
      currentInput.result,
      target,
      'origin/main',
      'feature/x',
    );
  });
});

describe('toUserFacingError', () => {
  test('maps domain failures to stable concise messages', () => {
    expect(toUserFacingError(new MissingRefError('refs/heads/gone')).message)
      .toBe('The selected branch no longer exists');
    expect(toUserFacingError(new NoCommonAncestorError('a'.repeat(40), 'b'.repeat(40))).message)
      .toBe('The branches do not share a common ancestor');
    expect(toUserFacingError(new Error('secret\u0000details')).message)
      .toBe('Unable to compare branches');
  });

  test('redacts credential-key variants from technical output', () => {
    const text = technicalErrorText(new Error([
      'client_secret=client-secret-value',
      'private-token: private-token-value',
      'refreshToken=refresh-token-value',
      'api_key="api-key-value"',
      'X-Api-Key: x-api-key-value',
    ].join(' ')));

    expect(text).toContain('client_secret=[REDACTED]');
    expect(text).toContain('private-token: [REDACTED]');
    expect(text).toContain('refreshToken=[REDACTED]');
    expect(text).toContain('api_key=[REDACTED]');
    expect(text).toContain('X-Api-Key: [REDACTED]');
    expect(text).not.toMatch(/(?:client-secret-value|private-token-value|refresh-token-value|api-key-value|x-api-key-value)/);
  });
});

function cancellationSource(): ControllerCancellationTokenSource {
  let cancelled = false;
  return {
    token: {
      get isCancellationRequested() { return cancelled; },
      onCancellationRequested: () => ({ dispose() {} }),
    } as ControllerCancellationTokenSource['token'],
    cancel() { cancelled = true; },
    dispose() {},
  };
}
