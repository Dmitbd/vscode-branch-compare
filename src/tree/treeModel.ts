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

export interface FormattedStatusCounts {
  readonly added: string;
  readonly modified: string;
  readonly deleted: string;
}

export interface FormattedSummary {
  readonly files: string;
  readonly additions: string;
  readonly deletions: string;
}

export interface ViewFolderNode {
  readonly id: string;
  readonly kind: 'folder';
  readonly label: string;
  readonly path: string;
  readonly counts: StatusCounts;
  readonly formattedCounts: FormattedStatusCounts;
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
  readonly pathKey?: string;
  readonly previewable: boolean;
}

export type ViewTreeNode = ViewFolderNode | ViewFileNode;

export interface CompareViewModel {
  readonly repositoryLabel: string;
  readonly showRepositorySelector: boolean;
  readonly branches: {
    readonly base: string;
    readonly compare: string;
  };
  readonly summary?: ChangeSummary;
  readonly summaryMetrics?: FormattedSummary;
  readonly nodes: readonly ViewTreeNode[];
  readonly initialExpandedPaths: readonly string[];
  readonly showUnchanged: boolean;
  readonly completeTreeLoading: boolean;
  readonly loading: boolean;
  readonly error?: string;
  readonly canRetry: boolean;
  readonly completeTreeError?: string;
  readonly canRetryCompleteTree: boolean;
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
  readonly completeTreeError?: Error;
  readonly loading?: boolean;
  readonly error?: Error;
}

interface MutableFolder {
  readonly label: string;
  readonly path: string;
  readonly displayPath: string;
  readonly folders: Map<string, MutableFolder>;
  readonly files: ViewFileNode[];
}

const displayPathCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const maximumInitialFolderChildren = 200;

export function formatMetric(value: number): string {
  if (value <= 9999) {
    return String(value);
  }
  const compact = Math.round(value / 100) / 10;
  return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
}

export function buildTreeModel(input: TreeModelInput): CompareViewModel {
  const selection = input.selection;
  const error = input.error ? errorMessage(input.error) : undefined;
  const completeTreeError = error || !input.completeTreeError
    ? undefined
    : errorMessage(input.completeTreeError);
  const result = error ? undefined : input.result;
  const showUnchanged = input.showUnchanged ?? false;
  const generation = input.comparisonGeneration ?? 0;
  const fileNodes = result ? createChangedNodes(result.files, generation) : new Map<string, ViewFileNode>();

  if (result && showUnchanged && input.completeTree) {
    addUnchangedNodes(fileNodes, changedPaths(result.files), input.completeTree, generation);
  }
  const nodes = createTree(fileNodes.values());

  const model: CompareViewModel = {
    repositoryLabel: input.repository?.label ?? '',
    showRepositorySelector: input.repositories.length > 1,
    branches: Object.freeze({
      base: displayRef(selection?.baseRef ?? input.baseRef, input.refs),
      compare: displayRef(selection?.compareRef ?? input.compareRef, input.refs),
    }),
    summary: result ? Object.freeze({ ...result.summary }) : undefined,
    summaryMetrics: result ? formatSummary(result.summary) : undefined,
    nodes,
    initialExpandedPaths: initialExpandedPaths(nodes),
    showUnchanged,
    completeTreeLoading: input.completeTreeLoading ?? false,
    loading: input.loading ?? false,
    error,
    canRetry: error !== undefined,
    completeTreeError,
    canRetryCompleteTree: completeTreeError !== undefined,
  };

  return Object.freeze(model);
}

function createChangedNodes(
  files: readonly ChangedFile[],
  generation: number,
): Map<string, ViewFileNode> {
  const nodes = new Map<string, ViewFileNode>();
  for (const sourceFile of files) {
    const path = displayPath(sourceFile);
    const file = immutableChangedFile(sourceFile);
    const status = presentationStatus(file);
    const pathKey = file.newPathKey ?? file.oldPathKey ?? Buffer.from(path).toString('base64url');
    const previewable = file.oldObjectKind !== 'gitlink' && file.newObjectKind !== 'gitlink';
    const binary = !previewable || file.lineChanges?.additions === null || file.lineChanges?.deletions === null;
    const target = Object.freeze({ kind: 'changed' as const, file });
    nodes.set(pathKey, Object.freeze({
      id: fileId(target.kind, pathIdentity(pathKey)),
      kind: 'file',
      label: basename(path),
      path,
      pathKey,
      previewable,
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
  excludedPaths: ReadonlySet<string>,
  completeTree: CompleteTreePaths,
  generation: number,
): void {
  const completePaths = new Map([
    ...completeTree.mergeBasePaths,
    ...completeTree.comparePaths,
  ].map((entry) => [treePathKey(entry), entry] as const));
  for (const [pathKey, entry] of completePaths) {
    const path = typeof entry === 'string' ? entry : entry.path;
    if (nodes.has(pathKey) || excludedPaths.has(pathKey)) {
      continue;
    }
    const target = typeof entry === 'string'
      ? Object.freeze({ kind: 'unchanged' as const, path })
      : Object.freeze({ kind: 'unchanged' as const, path, pathKey, blobOid: entry.blobOid, objectKind: entry.objectKind });
    nodes.set(pathKey, Object.freeze({
      id: fileId(target.kind, pathIdentity(pathKey)),
      kind: 'file',
      label: basename(path),
      path,
      pathKey,
      previewable: typeof entry === 'string' || entry.objectKind !== 'gitlink',
      status: undefined,
      additions: undefined,
      deletions: undefined,
      binary: false,
      target,
      generation,
    }));
  }
}

function changedPaths(files: readonly ChangedFile[]): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const file of files) {
    if (file.oldPath) {
      paths.add(file.oldPathKey ?? Buffer.from(file.oldPath).toString('base64url'));
    }
    if (file.newPath) {
      paths.add(file.newPathKey ?? Buffer.from(file.newPath).toString('base64url'));
    }
  }
  return paths;
}

function createTree(files: Iterable<ViewFileNode>): readonly ViewTreeNode[] {
  const root: MutableFolder = { label: '', path: '', displayPath: '', folders: new Map(), files: [] };

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    const segmentKeys = file.pathKey ? rawSegmentKeys(file.pathKey) : segments;
    if (segments.length === 0) {
      continue;
    }
    segments.pop();
    let parent = root;
    for (const [index, segment] of segments.entries()) {
      const displayPath = parent.displayPath ? `${parent.displayPath}/${segment}` : segment;
      const folderKey = segmentKeys[index] ?? segment;
      const rawFolderKey = joinRawSegmentKeys(segmentKeys.slice(0, index + 1));
      const path = pathIdentity(rawFolderKey);
      let folder = parent.folders.get(folderKey);
      if (!folder) {
        folder = { label: segment, path, displayPath, folders: new Map(), files: [] };
        parent.folders.set(folderKey, folder);
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
        formattedCounts: formatCounts(childTree.counts),
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

function formatSummary(summary: ChangeSummary): FormattedSummary {
  return Object.freeze({
    files: formatMetric(summary.files),
    additions: formatMetric(summary.additions),
    deletions: formatMetric(summary.deletions),
  });
}

function formatCounts(counts: StatusCounts): FormattedStatusCounts {
  return Object.freeze({
    added: formatMetric(counts.added),
    modified: formatMetric(counts.modified),
    deleted: formatMetric(counts.deleted),
  });
}

function initialExpandedPaths(nodes: readonly ViewTreeNode[]): readonly string[] {
  const firstFolder = nodes.find((node): node is ViewFolderNode => (
    node.kind === 'folder' && node.children.length > 0
  ));
  return Object.freeze(
    firstFolder && firstFolder.children.length <= maximumInitialFolderChildren
      ? [firstFolder.path]
      : [],
  );
}

function immutableChangedFile(file: ChangedFile): ChangedFile {
  return Object.freeze({
    status: file.status,
    oldPath: file.oldPath,
    newPath: file.newPath,
    oldPathKey: file.oldPathKey,
    newPathKey: file.newPathKey,
    oldBlobOid: file.oldBlobOid,
    newBlobOid: file.newBlobOid,
    oldObjectKind: file.oldObjectKind,
    newObjectKind: file.newObjectKind,
    lineChanges: file.lineChanges ? Object.freeze({ ...file.lineChanges }) : undefined,
  });
}

function treePathKey(path: import('../domain/model').TreePath): string {
  return typeof path === 'string' ? Buffer.from(path).toString('base64url') : path.pathKey;
}

function pathIdentity(pathKey: string): string {
  return `b64:${pathKey}`;
}

function rawSegmentKeys(pathKey: string): string[] {
  const raw = Buffer.from(pathKey, 'base64url');
  const keys: string[] = [];
  let start = 0;
  for (let index = 0; index <= raw.length; index += 1) {
    if (index === raw.length || raw[index] === 0x2f) {
      keys.push(raw.subarray(start, index).toString('base64url'));
      start = index + 1;
    }
  }
  return keys;
}

function joinRawSegmentKeys(keys: readonly string[]): string {
  return Buffer.concat(keys.flatMap((key, index) => (
    index === 0 ? [Buffer.from(key, 'base64url')] : [Buffer.from('/'), Buffer.from(key, 'base64url')]
  ))).toString('base64url');
}

function displayPath(file: ChangedFile): string {
  const path = file.newPath ?? file.oldPath;
  if (!path) {
    throw new TypeError('Changed file must have an old or new path.');
  }
  return path;
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
  const displayOrder = displayPathCollator.compare(
    left.normalize('NFC'),
    right.normalize('NFC'),
  );
  return displayOrder || (left < right ? -1 : left > right ? 1 : 0);
}
