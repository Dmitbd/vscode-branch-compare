import type {
  ChangedFile,
  ChangeSummary,
  ComparisonResult,
  ComparisonSelection,
  CompleteTreePaths,
  DiffTarget,
  GitRef,
} from '../domain/model';
import type { RepositorySnapshot } from '../repositories/repositoryProvider';

export interface StatusCounts {
  readonly added: number;
  readonly modified: number;
  readonly deleted: number;
}

export interface ViewFolderNode {
  readonly id: string;
  readonly kind: 'folder';
  readonly label: string;
  readonly path: string;
  readonly counts: StatusCounts;
  readonly children: readonly ViewTreeNode[];
}

export interface ViewFileNode {
  readonly id: string;
  readonly kind: 'file';
  readonly label: string;
  readonly path: string;
  readonly status?: 'added' | 'modified' | 'deleted';
  readonly additions?: string;
  readonly deletions?: string;
  readonly binary: boolean;
  readonly target: DiffTarget;
  readonly generation: number;
}

export type ViewTreeNode = ViewFolderNode | ViewFileNode;

export interface CompareViewModel {
  readonly branches: {
    readonly base: string;
    readonly compare: string;
  };
  readonly summary?: ChangeSummary;
  readonly nodes: readonly ViewTreeNode[];
  readonly showUnchanged: boolean;
  readonly completeTreeLoading: boolean;
  readonly loading: boolean;
  readonly error?: string;
  readonly canRetry: boolean;
}

export interface TreeModelInput {
  readonly repositories: readonly RepositorySnapshot[];
  readonly repository?: RepositorySnapshot;
  readonly refs: readonly GitRef[];
  readonly baseRef?: string;
  readonly compareRef?: string;
  readonly selection?: ComparisonSelection;
  readonly result?: ComparisonResult;
  readonly completeTree?: CompleteTreePaths;
  readonly comparisonGeneration?: number;
  readonly showUnchanged?: boolean;
  readonly completeTreeLoading?: boolean;
  readonly loading?: boolean;
  readonly error?: Error;
}

interface MutableFolder {
  readonly label: string;
  readonly path: string;
  readonly folders: Map<string, MutableFolder>;
  readonly files: ViewFileNode[];
}

const displayPathCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function formatMetric(value: number): string {
  if (value <= 9999) {
    return String(value);
  }
  const compact = Math.round(value / 100) / 10;
  return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
}

export function buildTreeModel(input: TreeModelInput): CompareViewModel {
  const selection = input.selection;
  const result = input.result;
  const showUnchanged = input.showUnchanged ?? false;
  const generation = input.comparisonGeneration ?? 0;
  const fileNodes = result ? createChangedNodes(result.files, generation) : new Map<string, ViewFileNode>();

  if (showUnchanged && input.completeTree) {
    addUnchangedNodes(fileNodes, input.completeTree, generation);
  }

  const error = input.error ? errorMessage(input.error) : undefined;
  const model: CompareViewModel = {
    branches: Object.freeze({
      base: displayRef(selection?.baseRef ?? input.baseRef, input.refs),
      compare: displayRef(selection?.compareRef ?? input.compareRef, input.refs),
    }),
    summary: result ? Object.freeze({ ...result.summary }) : undefined,
    nodes: createTree(fileNodes.values()),
    showUnchanged,
    completeTreeLoading: input.completeTreeLoading ?? false,
    loading: input.loading ?? false,
    error,
    canRetry: error !== undefined,
  };

  return Object.freeze(model);
}

function createChangedNodes(
  files: readonly ChangedFile[],
  generation: number,
): Map<string, ViewFileNode> {
  const nodes = new Map<string, ViewFileNode>();
  for (const sourceFile of files) {
    const path = normalizedDisplayPath(sourceFile);
    const file = immutableChangedFile(sourceFile);
    const status = presentationStatus(file);
    const binary = file.lineChanges?.additions === null || file.lineChanges?.deletions === null;
    const target = Object.freeze({ kind: 'changed' as const, file });
    nodes.set(path, Object.freeze({
      id: fileId(target.kind, path),
      kind: 'file',
      label: basename(path),
      path,
      status,
      additions: binary ? '—' : metric(file.lineChanges?.additions),
      deletions: binary ? '—' : metric(file.lineChanges?.deletions),
      binary,
      target,
      generation,
    }));
  }
  return nodes;
}

function addUnchangedNodes(
  nodes: Map<string, ViewFileNode>,
  completeTree: CompleteTreePaths,
  generation: number,
): void {
  const completePaths = new Set([
    ...completeTree.mergeBasePaths.map(normalizedPath),
    ...completeTree.comparePaths.map(normalizedPath),
  ]);
  for (const path of completePaths) {
    if (nodes.has(path)) {
      continue;
    }
    const target = Object.freeze({ kind: 'unchanged' as const, path });
    nodes.set(path, Object.freeze({
      id: fileId(target.kind, path),
      kind: 'file',
      label: basename(path),
      path,
      status: undefined,
      additions: undefined,
      deletions: undefined,
      binary: false,
      target,
      generation,
    }));
  }
}

function createTree(files: Iterable<ViewFileNode>): readonly ViewTreeNode[] {
  const root: MutableFolder = { label: '', path: '', folders: new Map(), files: [] };

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    if (segments.length === 0) {
      continue;
    }
    segments.pop();
    let parent = root;
    for (const segment of segments) {
      const path = parent.path ? `${parent.path}/${segment}` : segment;
      let folder = parent.folders.get(segment);
      if (!folder) {
        folder = { label: segment, path, folders: new Map(), files: [] };
        parent.folders.set(segment, folder);
      }
      parent = folder;
    }
    parent.files.push(file);
  }

  return freezeNodes(sortFolder(root).nodes);
}

function sortFolder(folder: MutableFolder): { readonly nodes: readonly ViewTreeNode[]; readonly counts: StatusCounts } {
  const counts = mutableCounts();
  const folders = [...folder.folders.values()]
    .sort((left, right) => compareLabels(left.label, right.label))
    .map((child) => {
      const childTree = sortFolder(child);
      addCounts(counts, childTree.counts);
      return Object.freeze({
        id: `folder:${child.path}`,
        kind: 'folder' as const,
        label: child.label,
        path: child.path,
        counts: childTree.counts,
        children: freezeNodes(childTree.nodes),
      });
    });
  const files = [...folder.files].sort((left, right) => compareLabels(left.label, right.label));
  for (const file of files) {
    if (file.status) {
      counts[file.status] += 1;
    }
  }
  return {
    nodes: [...folders, ...files],
    counts: Object.freeze({ ...counts }),
  };
}

function mutableCounts(): { added: number; modified: number; deleted: number } {
  return { added: 0, modified: 0, deleted: 0 };
}

function addCounts(
  target: { added: number; modified: number; deleted: number },
  source: StatusCounts,
): void {
  target.added += source.added;
  target.modified += source.modified;
  target.deleted += source.deleted;
}

function freezeNodes(nodes: readonly ViewTreeNode[]): readonly ViewTreeNode[] {
  return Object.freeze([...nodes]);
}

function immutableChangedFile(file: ChangedFile): ChangedFile {
  return Object.freeze({
    status: file.status,
    oldPath: file.oldPath,
    newPath: file.newPath,
    lineChanges: file.lineChanges ? Object.freeze({ ...file.lineChanges }) : undefined,
  });
}

function normalizedDisplayPath(file: ChangedFile): string {
  const path = file.newPath ?? file.oldPath;
  if (!path) {
    throw new TypeError('Changed file must have an old or new path.');
  }
  return normalizedPath(path);
}

function normalizedPath(path: string): string {
  return path.normalize('NFC');
}

function presentationStatus(file: ChangedFile): ViewFileNode['status'] {
  return file.status === 'renamed' ? 'modified' : file.status;
}

function metric(value: number | null | undefined): string | undefined {
  return typeof value === 'number' ? formatMetric(value) : undefined;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function fileId(kind: DiffTarget['kind'], path: string): string {
  return `${kind}:${path}`;
}

function displayRef(ref: string | undefined, refs: readonly GitRef[]): string {
  if (!ref) {
    return '';
  }
  return refs.find((candidate) => candidate.fullName === ref)?.displayName
    ?? ref.replace(/^refs\/(?:heads|remotes)\//, '');
}

function errorMessage(error: Error): string {
  return error.message || 'Unable to compare branches. Select to retry.';
}

function compareLabels(left: string, right: string): number {
  const displayOrder = displayPathCollator.compare(left, right);
  return displayOrder || (left < right ? -1 : left > right ? 1 : 0);
}
