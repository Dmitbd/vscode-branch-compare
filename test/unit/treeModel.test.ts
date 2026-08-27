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
import { gitPath } from '../../src/git/gitPath';

const repository = {
  id: 'repo-1',
  label: 'project',
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
  test('uses one globally injective raw-key namespace for colliding valid and invalid names', () => {
    const invalidKey = Buffer.from([0xff]).toString('base64url');
    const validPath = 'raw:_w';
    const validKey = Buffer.from(validPath).toString('base64url');
    const model = buildTreeModel(modelInput([
      { ...changed('modified', '\\xFF', '\\xFF', 1, 1), oldPathKey: invalidKey, newPathKey: invalidKey },
      { ...changed('modified', validPath, validPath, 1, 1), oldPathKey: validKey, newPathKey: validKey },
    ]));
    const nodes = flatten(model.nodes).filter((node) => node.kind === 'file');
    expect(nodes.map((node) => node.id)).toEqual([
      `changed:b64:${invalidKey}`,
      `changed:b64:${validKey}`,
    ]);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(2);

    const invalidFolderRaw = Buffer.from([0xff, 0x2f, 0x61]);
    const validFolderPath = 'b64:_w/a';
    const folderModel = buildTreeModel(modelInput([
      { ...changed('modified', '\\xFF/a', '\\xFF/a', 1, 1), oldPathKey: invalidFolderRaw.toString('base64url'), newPathKey: invalidFolderRaw.toString('base64url') },
      { ...changed('modified', validFolderPath, validFolderPath, 1, 1), oldPathKey: Buffer.from(validFolderPath).toString('base64url'), newPathKey: Buffer.from(validFolderPath).toString('base64url') },
    ]));
    const folders = folderModel.nodes.filter((node) => node.kind === 'folder');
    expect(folders).toHaveLength(2);
    expect(new Set(folders.map((node) => node.id)).size).toBe(2);
  });
  test('keeps valid C1 and invalid raw-byte folder and sibling-file labels visually distinct', () => {
    const validRaw = Buffer.from([0xc2, 0x85, 0x2f, 0x66]);
    const invalidRaw = Buffer.from([0x85, 0x2f, 0x66]);
    const validFileRaw = Buffer.from([0x64, 0x2f, 0xc2, 0x85]);
    const invalidFileRaw = Buffer.from([0x64, 0x2f, 0x85]);
    const valid = gitPath(validRaw);
    const invalid = gitPath(invalidRaw);
    const validFile = gitPath(validFileRaw);
    const invalidFile = gitPath(invalidFileRaw);
    const model = buildTreeModel(modelInput([
      { ...changed('modified', valid.path, valid.path, 1, 1), oldPathKey: valid.pathKey, newPathKey: valid.pathKey },
      { ...changed('modified', invalid.path, invalid.path, 1, 1), oldPathKey: invalid.pathKey, newPathKey: invalid.pathKey },
      { ...changed('modified', validFile.path, validFile.path, 1, 1), oldPathKey: validFile.pathKey, newPathKey: validFile.pathKey },
      { ...changed('modified', invalidFile.path, invalidFile.path, 1, 1), oldPathKey: invalidFile.pathKey, newPathKey: invalidFile.pathKey },
    ]));
    const folders = model.nodes.filter((node) => node.kind === 'folder');
    expect(folders.map((node) => node.label)).toEqual(['\\u{85}', '\\x85', 'd']);
    const siblingFiles = folders.find((node) => node.label === 'd')?.children ?? [];
    expect(siblingFiles.map((node) => node.label)).toEqual(['\\u{85}', '\\x85']);
    expect(new Set(siblingFiles.map((node) => node.label)).size).toBe(2);
  });
  test('represents changed and unchanged gitlinks as non-previewable file-like rows', () => {
    const key = Buffer.from('vendor/sub').toString('base64url');
    const oid = '9'.repeat(40);
    const changedModel = buildTreeModel(modelInput([{
      ...changed('modified', 'vendor/sub', 'vendor/sub', 1, 1),
      oldPathKey: key, newPathKey: key, oldBlobOid: oid, newBlobOid: oid,
      oldObjectKind: 'gitlink', newObjectKind: 'gitlink',
    }]));
    const changedNode = flatten(changedModel.nodes).find((node): node is ViewFileNode => node.kind === 'file');
    expect(changedNode).toMatchObject({ previewable: false, binary: true, additions: '—', deletions: '—' });
    expect(changedModel.metricColumnWidths).toEqual({ added: 0, modified: 1, deleted: 1 });

    const unchangedModel = buildTreeModel({
      ...modelInput([]), showUnchanged: true,
      completeTree: { mergeBasePaths: [], comparePaths: [{ path: 'vendor/sub', pathKey: key, blobOid: oid, objectKind: 'gitlink' }] },
    });
    const unchangedNode = flatten(unchangedModel.nodes).find((node): node is ViewFileNode => node.kind === 'file');
    expect(unchangedNode).toMatchObject({ previewable: false, target: { objectKind: 'gitlink' } });
  });
  test('publishes the selected repository label and only shows a selector for multiple repositories', () => {
    const secondRepository = {
      ...repository,
      id: 'repo-2',
      label: 'other-project',
    } as RepositorySnapshot;

    expect(buildTreeModel({ repositories: [], refs: [] })).toMatchObject({
      repositoryLabel: '',
      showRepositorySelector: false,
    });
    expect(buildTreeModel(modelInput([]))).toMatchObject({
      repositoryLabel: 'project',
      showRepositorySelector: false,
    });
    expect(buildTreeModel({
      ...modelInput([]),
      repositories: [repository, secondRepository],
    })).toMatchObject({
      repositoryLabel: 'project',
      showRepositorySelector: true,
    });
  });

  test('builds branch, summary, folder aggregate, and file presentation data', () => {
    const model = buildTreeModel(modelInput([
      changed('added', undefined, 'src/new.ts', 10, 0),
      changed('modified', 'src/edit.ts', 'src/edit.ts', 3, 4),
      changed('renamed', 'src/old.ts', 'src/renamed.ts', 1, 1),
      changed('deleted', 'src/removed.ts', undefined, 0, 8),
    ]));

    expect(model.branches).toEqual({ base: 'origin/develop', compare: 'feature/x' });
    expect(model.summary).toEqual({ files: 4, additions: 14, deletions: 13 });
    expect(model.summaryMetrics).toEqual({ files: '4', additions: '14', deletions: '13' });
    expect(model.metricColumnWidths).toEqual({ added: 3, modified: 1, deleted: 2 });
    expect(model.nodes[0]).toMatchObject({
      kind: 'folder', label: 'src', path: `b64:${Buffer.from('src').toString('base64url')}`,
      status: 'modified',
      counts: { added: 1, modified: 2, deleted: 1 },
      formattedCounts: { added: '1', modified: '2', deleted: '1' },
    });
    expect(flatten(model.nodes).find((node) => node.path === 'src/renamed.ts')).toMatchObject({
      status: 'modified', additions: '1', deletions: '1',
      target: { kind: 'changed', file: { status: 'renamed' } }, generation: 7,
    });
  });

  test.each([
    ['only added descendants', [changed('added', undefined, 'src/new.ts', 1, 0)], 'added'],
    ['only deleted descendants', [changed('deleted', 'src/old.ts', undefined, 0, 1)], 'deleted'],
    ['only modified descendants', [changed('modified', 'src/edit.ts', 'src/edit.ts', 1, 1)], 'modified'],
    ['mixed changed descendants', [
      changed('added', undefined, 'src/new.ts', 1, 0),
      changed('deleted', 'src/old.ts', undefined, 0, 1),
    ], 'modified'],
    ['only unchanged descendants', [], undefined],
  ] as const)('derives folder status from %s', (_name, files, expectedStatus) => {
    const model = buildTreeModel(modelInput(files, expectedStatus === undefined ? {
      showUnchanged: true,
      completeTree: { mergeBasePaths: ['src/unchanged.ts'], comparePaths: ['src/unchanged.ts'] },
    } : {}));

    expect(model.nodes[0]).toMatchObject({ kind: 'folder', status: expectedStatus });
  });

  test('measures metric widths from descendants below nested folders', () => {
    const model = buildTreeModel(modelInput([
      changed('modified', 'src/visible.ts', 'src/visible.ts', 1, 2),
      changed('modified', 'src/collapsed/deep.ts', 'src/collapsed/deep.ts', 10_000, 10_000),
    ]));

    expect(model.metricColumnWidths).toEqual({ added: 4, modified: 1, deleted: 4 });
  });

  test('measures compact metric display strings instead of raw counts', () => {
    const files = [
      ...Array.from({ length: 10_000 }, (_, index) => changed('added', undefined, `added/file-${index}.ts`, 0, 0)),
      ...Array.from({ length: 12_400 }, (_, index) => changed('modified', `modified/file-${index}.ts`, `modified/file-${index}.ts`, 0, 0)),
      ...Array.from({ length: 10_000 }, (_, index) => changed('deleted', `deleted/file-${index}.ts`, undefined, 0, 0)),
    ];

    expect(buildTreeModel(modelInput(files)).metricColumnWidths).toEqual({
      added: 4,
      modified: 5,
      deleted: 4,
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
      changed('modified', 'logo.png', 'logo.png', null, null),
    ]));

    expect(flatten(model.nodes)[0]).toMatchObject({
      binary: true, additions: '—', deletions: '—',
    });
    expect(model.metricColumnWidths).toEqual({ added: 0, modified: 0, deleted: 1 });
  });

  test('uses one compact formatter for 10,000-file summary and folder counts', () => {
    const files = Array.from({ length: 10_000 }, (_, index) => (
      changed('added', undefined, `src/file-${index}.ts`, 1, 0)
    ));

    const model = buildTreeModel(modelInput(files));

    expect(model.summaryMetrics).toEqual({ files: '10k', additions: '10k', deletions: '0' });
    expect(model.nodes[0]).toMatchObject({
      kind: 'folder',
      counts: { added: 10_000, modified: 0, deleted: 0 },
      formattedCounts: { added: '10k', modified: '0', deleted: '0' },
    });
    expect(model.initialExpandedPaths).toEqual([]);
  });

  test('suggests only the first non-empty top-level folder for initial expansion', () => {
    const model = buildTreeModel(modelInput([
      changed('modified', 'apps/web/src/deep.ts', 'apps/web/src/deep.ts', 1, 1),
      changed('modified', 'docs/guide.md', 'docs/guide.md', 1, 1),
    ]));

    expect(model.initialExpandedPaths).toEqual([`b64:${Buffer.from('apps').toString('base64url')}`]);
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
      `unchanged:b64:${Buffer.from(decomposed).toString('base64url')}`,
      `unchanged:b64:${Buffer.from(composed).toString('base64url')}`,
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

  test('keeps file-to-directory transitions as distinct tree nodes with unique ids', () => {
    const model = buildTreeModel(modelInput([
      changed('deleted', 'config', undefined, 0, 1),
    ], {
      showUnchanged: true,
      completeTree: {
        mergeBasePaths: ['config'],
        comparePaths: ['config/default.json'],
      },
    }));

    expect(model.nodes.map((node) => ({ kind: node.kind, path: node.path, id: node.id }))).toEqual([
      { kind: 'folder', path: `b64:${Buffer.from('config').toString('base64url')}`, id: `folder:b64:${Buffer.from('config').toString('base64url')}` },
      { kind: 'file', path: 'config', id: `changed:b64:${Buffer.from('config').toString('base64url')}` },
    ]);
    expect(new Set(model.nodes.map((node) => node.id)).size).toBe(2);
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
