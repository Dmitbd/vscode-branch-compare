import { describe, expect, test } from 'vitest';
import type {
  ChangedFile,
  ChangeSummary,
  ComparisonResult,
  ComparisonSelection,
  CompleteTreePaths,
  GitRef,
} from '../../src/domain/model';
import type { RepositorySnapshot } from '../../src/repositories/repositoryProvider';
import {
  buildTreeModel,
  formatMetric,
  type ViewFileNode,
  type ViewTreeNode,
} from '../../src/tree/treeModel';

const repository = {
  id: 'repo-1',
  rootUri: { toString: () => 'file:///workspace/project' },
  currentBranch: 'feature/x',
  remotes: ['origin'],
} as unknown as RepositorySnapshot;

const refs: readonly GitRef[] = [
  { fullName: 'refs/remotes/origin/develop', displayName: 'origin/develop', kind: 'remote', remote: 'origin', commit: 'a'.repeat(40) },
  { fullName: 'refs/heads/feature/x', displayName: 'feature/x', kind: 'local', commit: 'b'.repeat(40) },
];

const selection: ComparisonSelection = {
  repositoryUri: 'file:///workspace/project',
  baseRef: 'refs/remotes/origin/develop',
  compareRef: 'refs/heads/feature/x',
};

function changed(
  status: ChangedFile['status'],
  oldPath: string | undefined,
  newPath: string | undefined,
  additions: number | null,
  deletions: number | null,
): ChangedFile {
  return { status, oldPath, newPath, lineChanges: { additions, deletions } };
}

function result(files: readonly ChangedFile[]): ComparisonResult {
  const summary = files.reduce<ChangeSummary>((total, file) => ({
    files: total.files + 1,
    additions: total.additions + (file.lineChanges?.additions ?? 0),
    deletions: total.deletions + (file.lineChanges?.deletions ?? 0),
  }), { files: 0, additions: 0, deletions: 0 });
  return {
    selection,
    baseSha: 'a'.repeat(40),
    compareSha: 'b'.repeat(40),
    mergeBaseSha: 'c'.repeat(40),
    files,
    summary,
  };
}

function modelInput(files: readonly ChangedFile[], overrides: Record<string, unknown> = {}) {
  return {
    repositories: [repository],
    repository,
    refs,
    selection,
    result: result(files),
    comparisonGeneration: 7,
    ...overrides,
  };
}

function flatten(nodes: readonly ViewTreeNode[]): readonly ViewFileNode[] {
  return nodes.flatMap((node) => node.kind === 'file' ? [node] : flatten(node.children));
}

describe('formatMetric', () => {
  test.each([
    [9999, '9999'],
    [10000, '10k'],
    [12400, '12.4k'],
  ])('formats %i as %s', (value, expected) => {
    expect(formatMetric(value)).toBe(expected);
  });
});

describe('buildTreeModel', () => {
  test('builds branch, summary, folder aggregate, and file presentation data', () => {
    const model = buildTreeModel(modelInput([
      changed('added', undefined, 'src/new.ts', 10, 0),
      changed('modified', 'src/edit.ts', 'src/edit.ts', 3, 4),
      changed('renamed', 'src/old.ts', 'src/renamed.ts', 1, 1),
      changed('deleted', 'src/removed.ts', undefined, 0, 8),
    ]));

    expect(model.branches).toEqual({ base: 'origin/develop', compare: 'feature/x' });
    expect(model.summary).toEqual({ files: 4, additions: 14, deletions: 13 });
    expect(model.nodes[0]).toMatchObject({
      kind: 'folder', label: 'src', path: 'src',
      counts: { added: 1, modified: 2, deleted: 1 },
    });
    expect(flatten(model.nodes).find((node) => node.path === 'src/renamed.ts')).toMatchObject({
      status: 'modified', additions: '1', deletions: '1',
      target: { kind: 'changed', file: { status: 'renamed' } }, generation: 7,
    });
  });

  test('counts a renamed file once as modified and preserves fixed zero count slots', () => {
    const model = buildTreeModel(modelInput([
      changed('renamed', 'src/old.ts', 'src/new.ts', 0, 0),
    ]));

    expect(model.nodes[0]).toMatchObject({
      kind: 'folder', counts: { added: 0, modified: 1, deleted: 0 },
    });
    expect(Object.keys(model.nodes[0]?.kind === 'folder' ? model.nodes[0].counts : {}))
      .toEqual(['added', 'modified', 'deleted']);
  });

  test('uses dash metrics for a binary changed file', () => {
    const model = buildTreeModel(modelInput([
      changed('modified', 'assets/logo.png', 'assets/logo.png', null, null),
    ]));

    expect(flatten(model.nodes)[0]).toMatchObject({
      binary: true, additions: '—', deletions: '—',
    });
  });

  test('unions changed files with neutral unchanged paths from both complete trees', () => {
    const files = [
      changed('modified', 'src/edit.ts', 'src/edit.ts', 3, 4),
      changed('added', undefined, 'src/new.ts', 10, 0),
      changed('deleted', 'src/removed.ts', undefined, 0, 8),
    ];
    const completeTree: CompleteTreePaths = {
      mergeBasePaths: ['README.md', 'src/edit.ts', 'src/removed.ts'],
      comparePaths: ['README.md', 'src/edit.ts', 'src/new.ts'],
    };

    const model = buildTreeModel(modelInput(files, { showUnchanged: true, completeTree }));
    const nodes = flatten(model.nodes);

    expect(nodes.map((node) => node.path).sort()).toEqual([
      'README.md', 'src/edit.ts', 'src/new.ts', 'src/removed.ts',
    ]);
    expect(nodes.find((node) => node.path === 'README.md')).toEqual(expect.objectContaining({
      status: undefined, additions: undefined, deletions: undefined, binary: false,
      target: { kind: 'unchanged', path: 'README.md' },
    }));
    expect(nodes.find((node) => node.path === 'src/new.ts')?.status).toBe('added');
    expect(nodes.find((node) => node.path === 'src/removed.ts')?.status).toBe('deleted');
  });

  test('keeps canonically equivalent raw Git paths as distinct unchanged diff targets', () => {
    const decomposed = 'src/e\u0301clair.ts';
    const composed = 'src/éclair.ts';
    const completeTree: CompleteTreePaths = {
      mergeBasePaths: [decomposed, composed],
      comparePaths: [decomposed, composed],
    };

    const model = buildTreeModel(modelInput([], { showUnchanged: true, completeTree }));
    const nodes = flatten(model.nodes);

    expect(nodes).toHaveLength(2);
    expect(nodes.map((node) => node.path)).toEqual([decomposed, composed]);
    expect(nodes.map((node) => node.id)).toEqual([
      `unchanged:${decomposed}`,
      `unchanged:${composed}`,
    ]);
    expect(nodes.map((node) => node.target)).toEqual([
      { kind: 'unchanged', path: decomposed },
      { kind: 'unchanged', path: composed },
    ]);
  });

  test('keeps canonically equivalent changed paths as distinct files', () => {
    const decomposed = 'src/e\u0301clair.ts';
    const composed = 'src/éclair.ts';

    const nodes = flatten(buildTreeModel(modelInput([
      changed('added', undefined, decomposed, 1, 0),
      changed('added', undefined, composed, 2, 0),
    ])).nodes);

    expect(nodes.map((node) => node.path)).toEqual([decomposed, composed]);
    expect(nodes.map((node) => node.target)).toEqual([
      expect.objectContaining({ kind: 'changed', file: expect.objectContaining({ newPath: decomposed }) }),
      expect.objectContaining({ kind: 'changed', file: expect.objectContaining({ newPath: composed }) }),
    ]);
  });

  test('shows a renamed file once by its new path in the complete-tree union', () => {
    const completeTree: CompleteTreePaths = {
      mergeBasePaths: ['README.md', 'src/old.ts'],
      comparePaths: ['README.md', 'src/renamed.ts'],
    };

    const model = buildTreeModel(modelInput([
      changed('renamed', 'src/old.ts', 'src/renamed.ts', 1, 1),
    ], { showUnchanged: true, completeTree }));
    const nodes = flatten(model.nodes);

    expect(nodes.map((node) => node.path).sort()).toEqual(['README.md', 'src/renamed.ts']);
    expect(nodes.find((node) => node.path === 'src/renamed.ts')).toMatchObject({
      status: 'modified',
      target: { kind: 'changed', file: { status: 'renamed' } },
    });
    expect(nodes.find((node) => node.path === 'src/old.ts')).toBeUndefined();
  });

  test('keeps deleted files visible without a complete tree', () => {
    const model = buildTreeModel(modelInput([
      changed('deleted', 'src/removed.ts', undefined, 0, 8),
    ]));

    expect(flatten(model.nodes)).toContainEqual(expect.objectContaining({
      path: 'src/removed.ts', status: 'deleted',
      target: { kind: 'changed', file: expect.objectContaining({ oldPath: 'src/removed.ts' }) },
    }));
  });

  test('retains existing result nodes while a refresh is loading', () => {
    const model = buildTreeModel(modelInput([
      changed('modified', 'src/edit.ts', 'src/edit.ts', 3, 4),
    ], { loading: true }));

    expect(model.loading).toBe(true);
    expect(flatten(model.nodes)).toHaveLength(1);
    expect(model.summary).toEqual({ files: 1, additions: 3, deletions: 4 });
  });

  test('maps a complete-tree error without discarding changed rows or exposing technical details', () => {
    const completeTreeError = Object.assign(
      new Error('Unable to load all files; try again'),
      { technicalError: new Error('raw ls-tree output') },
    );
    const model = buildTreeModel(modelInput([
      changed('modified', 'src/edit.ts', 'src/edit.ts', 3, 4),
    ], { completeTreeError }));

    expect(model).toMatchObject({
      completeTreeError: 'Unable to load all files; try again',
      canRetryCompleteTree: true,
      error: undefined,
      canRetry: false,
    });
    expect(flatten(model.nodes)).toHaveLength(1);
    expect(model.summary).toEqual({ files: 1, additions: 3, deletions: 4 });
    expect(JSON.stringify(model)).not.toContain('raw ls-tree output');
  });

  test('an error without a result exposes retry and no stale summary or nodes', () => {
    const model = buildTreeModel({
      repositories: [repository], repository, refs, selection,
      comparisonGeneration: 7, error: new Error('Git failed'),
    });

    expect(model).toMatchObject({
      error: 'Git failed', canRetry: true,
      completeTreeError: undefined, canRetryCompleteTree: false,
      loading: false, nodes: [],
    });
    expect(model.summary).toBeUndefined();
  });

  test('a final error discards nodes and summary from a previous result', () => {
    const model = buildTreeModel(modelInput([
      changed('modified', 'src/edit.ts', 'src/edit.ts', 3, 4),
    ], { error: new Error('Refresh failed') }));

    expect(model).toMatchObject({
      error: 'Refresh failed', canRetry: true, nodes: [],
    });
    expect(model.summary).toBeUndefined();
  });
});
