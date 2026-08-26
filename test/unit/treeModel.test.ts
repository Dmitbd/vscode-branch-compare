import { describe, expect, test } from 'vitest';
import type { ChangedFile, ComparisonResult, ComparisonSelection, GitRef } from '../../src/domain/model';
import type { RepositorySnapshot } from '../../src/repositories/repositoryProvider';
import { buildTreeModel } from '../../src/tree/treeModel';

const repository = {
  id: 'repo-1',
  rootUri: { toString: () => 'file:///workspace/project' },
  currentBranch: 'feature/x',
  remotes: ['origin'],
} as unknown as RepositorySnapshot;

const secondRepository = {
  ...repository,
  id: 'repo-2',
  rootUri: { toString: () => 'file:///workspace/second-project' },
} as RepositorySnapshot;

const refs: readonly GitRef[] = [
  { fullName: 'refs/remotes/origin/develop', displayName: 'origin/develop', kind: 'remote', remote: 'origin', commit: 'a'.repeat(40) },
  { fullName: 'refs/heads/feature/x', displayName: 'feature/x', kind: 'local', commit: 'b'.repeat(40) },
];

const selection: ComparisonSelection = {
  repositoryUri: 'file:///workspace/project',
  baseRef: 'refs/remotes/origin/develop',
  compareRef: 'refs/heads/feature/x',
};

function result(files: readonly ChangedFile[]): ComparisonResult {
  return {
    selection,
    baseSha: 'a'.repeat(40),
    compareSha: 'b'.repeat(40),
    mergeBaseSha: 'c'.repeat(40),
    files,
  };
}

describe('buildTreeModel', () => {
  test('renders branch pickers and a nested, naturally sorted file tree for one repository', () => {
    const files: readonly ChangedFile[] = [
      { status: 'modified', oldPath: 'src/zeta.ts', newPath: 'src/zeta.ts' },
      { status: 'added', oldPath: undefined, newPath: 'src/components/Button2.tsx' },
      { status: 'deleted', oldPath: 'README.md', newPath: undefined },
      { status: 'renamed', oldPath: 'src/Old.ts', newPath: 'src/New.ts' },
      { status: 'added', oldPath: undefined, newPath: 'src/components/Button10.tsx' },
    ];

    const tree = buildTreeModel({ repositories: [repository], repository, refs, selection, result: result(files) });

    expect(tree).toMatchObject([
      { kind: 'base', label: 'BASE', description: 'origin/develop', command: 'branchCompare.selectBase' },
      { kind: 'compare', label: 'COMPARE', description: 'feature/x', command: 'branchCompare.selectCompare' },
      { kind: 'folder', label: 'src' },
      { kind: 'file', label: 'README.md', file: { status: 'deleted' } },
    ]);
    expect(tree.some((node) => node.kind === 'repository')).toBe(false);

    const src = tree.find((node) => node.kind === 'folder' && node.label === 'src');
    expect(src).toMatchObject({
      children: [
        {
          kind: 'folder',
          label: 'components',
          children: [
            { kind: 'file', label: 'Button2.tsx', file: { status: 'added' } },
            { kind: 'file', label: 'Button10.tsx', file: { status: 'added' } },
          ],
        },
        { kind: 'file', label: 'New.ts', file: { status: 'renamed', oldPath: 'src/Old.ts', newPath: 'src/New.ts' } },
        { kind: 'file', label: 'zeta.ts', file: { status: 'modified' } },
      ],
    });
  });

  test('shows the repository picker only when more than one repository is available', () => {
    const tree = buildTreeModel({
      repositories: [repository, secondRepository],
      repository,
      refs,
      selection,
      result: result([]),
    });

    expect(tree[0]).toMatchObject({
      kind: 'repository',
      label: 'REPOSITORY',
      command: 'branchCompare.selectRepository',
    });
  });

  test('keeps changed-file data and every node immutable', () => {
    const file: ChangedFile = { status: 'modified', oldPath: 'src/a.ts', newPath: 'src/a.ts' };
    const tree = buildTreeModel({ repositories: [repository], repository, refs, selection, result: result([file]) });
    const src = tree.find((node) => node.kind === 'folder' && node.label === 'src');
    const fileNode = src?.kind === 'folder' ? src.children[0] : undefined;

    expect(Object.isFrozen(tree)).toBe(true);
    expect(Object.isFrozen(src)).toBe(true);
    expect(fileNode).toMatchObject({ kind: 'file', file });
    if (!fileNode || fileNode.kind !== 'file') {
      throw new Error('Expected a file node.');
    }
    expect(Object.isFrozen(fileNode.file)).toBe(true);
    expect(fileNode.file).not.toBe(file);
    expect(() => { (fileNode.file as { status: string }).status = 'added'; }).toThrow();
  });

  test('communicates empty, loading, missing-selection, missing-repository, and retryable-error states', () => {
    expect(buildTreeModel({ repositories: [repository], repository, refs, selection, result: result([]) }))
      .toContainEqual({ kind: 'message', label: 'No changed files.' });
    expect(buildTreeModel({ repositories: [repository], repository, refs, selection, loading: true }))
      .toContainEqual({ kind: 'message', label: 'Comparing branches…' });
    expect(buildTreeModel({ repositories: [repository], repository, refs }))
      .toContainEqual({ kind: 'message', label: 'Select BASE and COMPARE branches.' });
    expect(buildTreeModel({ repositories: [], refs }))
      .toEqual([{ kind: 'message', label: 'No repositories found' }]);
    expect(buildTreeModel({ repositories: [repository], repository, refs, selection, error: new Error('Git failed') }))
      .toContainEqual({
        kind: 'message',
        label: 'Git failed',
        command: 'branchCompare.refresh',
      });
  });

  test('shows an incomplete manual selection until both branches are chosen', () => {
    const tree = buildTreeModel({
      repositories: [repository],
      repository,
      refs,
      baseRef: 'refs/remotes/origin/develop',
    });

    expect(tree).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'base', description: 'origin/develop' }),
      expect.objectContaining({ kind: 'compare', description: 'Select a branch' }),
      expect.objectContaining({ kind: 'message', label: 'Select a compare branch' }),
    ]));
  });
});
