import type { ChangedFile, ComparisonResult, ComparisonSelection, GitRef } from '../domain/model';
import type { RepositorySnapshot } from '../repositories/repositoryProvider';

export type TreeCommand =
  | 'branchCompare.selectRepository'
  | 'branchCompare.selectBase'
  | 'branchCompare.selectCompare'
  | 'branchCompare.refresh'
  | 'branchCompare.openDiff';

interface TreeNodeBase {
  readonly label: string;
  readonly description?: string;
  readonly command?: TreeCommand;
}

export interface RepositoryTreeNode extends TreeNodeBase {
  readonly kind: 'repository';
  readonly command: 'branchCompare.selectRepository';
}

export interface SelectorTreeNode extends TreeNodeBase {
  readonly kind: 'base' | 'compare';
  readonly command: 'branchCompare.selectBase' | 'branchCompare.selectCompare';
}

export interface FolderTreeNode extends TreeNodeBase {
  readonly kind: 'folder';
  readonly children: readonly TreeNode[];
}

export interface FileTreeNode extends TreeNodeBase {
  readonly kind: 'file';
  readonly file: ChangedFile;
  readonly comparisonGeneration: number;
  readonly command: 'branchCompare.openDiff';
}

export interface MessageTreeNode extends TreeNodeBase {
  readonly kind: 'message';
}

export type TreeNode =
  | RepositoryTreeNode
  | SelectorTreeNode
  | FolderTreeNode
  | FileTreeNode
  | MessageTreeNode;

export interface TreeModelInput {
  readonly repositories: readonly RepositorySnapshot[];
  readonly repository?: RepositorySnapshot;
  readonly refs: readonly GitRef[];
  readonly baseRef?: string;
  readonly compareRef?: string;
  readonly selection?: ComparisonSelection;
  readonly result?: ComparisonResult;
  readonly comparisonGeneration?: number;
  readonly loading?: boolean;
  readonly error?: Error;
}

interface MutableFolder {
  readonly label: string;
  readonly folders: Map<string, MutableFolder>;
  readonly files: FileTreeNode[];
}

export function buildTreeModel(input: TreeModelInput): readonly TreeNode[] {
  if (input.repositories.length === 0) {
    return freezeNodes([{ kind: 'message', label: 'No repositories found' }]);
  }

  const nodes: TreeNode[] = [];
  if (input.repositories.length > 1) {
    nodes.push({
      kind: 'repository',
      label: 'REPOSITORY',
      description: repositoryDescription(input.repository),
      command: 'branchCompare.selectRepository',
    });
  }

  const repository = input.repository ?? (input.repositories.length === 1 ? input.repositories[0] : undefined);
  if (!repository) {
    nodes.push({ kind: 'message', label: 'Select a repository to begin.' });
    return freezeNodes(nodes);
  }

  nodes.push(
    selectorNode('base', 'BASE', input.selection?.baseRef ?? input.baseRef, input.refs),
    selectorNode('compare', 'COMPARE', input.selection?.compareRef ?? input.compareRef, input.refs),
  );

  if (!input.selection) {
    nodes.push({
      kind: 'message',
      label: input.error?.message
        ?? (input.baseRef ? 'Select a compare branch' : input.compareRef ? 'Select a base branch' : 'Select BASE and COMPARE branches.'),
    });
    return freezeNodes(nodes);
  }

  if (input.loading) {
    nodes.push({ kind: 'message', label: 'Comparing branches…' });
    return freezeNodes(nodes);
  }

  if (input.error) {
    nodes.push({
      kind: 'message',
      label: errorMessage(input.error),
      command: 'branchCompare.refresh',
    });
    return freezeNodes(nodes);
  }

  if (!input.result || input.result.files.length === 0) {
    nodes.push({ kind: 'message', label: 'No changed files.' });
    return freezeNodes(nodes);
  }

  nodes.push(...createFileTree(input.result.files, input.comparisonGeneration ?? 0));
  return freezeNodes(nodes);
}

function selectorNode(
  kind: SelectorTreeNode['kind'],
  label: string,
  ref: string | undefined,
  refs: readonly GitRef[],
): SelectorTreeNode {
  return {
    kind,
    label,
    description: ref ? displayRef(ref, refs) : 'Select a branch',
    command: kind === 'base' ? 'branchCompare.selectBase' : 'branchCompare.selectCompare',
  };
}

function createFileTree(files: readonly ChangedFile[], comparisonGeneration: number): readonly TreeNode[] {
  const root: MutableFolder = { label: '', folders: new Map(), files: [] };

  for (const changedFile of files) {
    const file = immutableChangedFile(changedFile);
    const path = file.newPath ?? file.oldPath;
    if (!path) {
      continue;
    }

    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    const fileLabel = segments.pop();
    if (!fileLabel) {
      continue;
    }

    let parent = root;
    for (const segment of segments) {
      let folder = parent.folders.get(segment);
      if (!folder) {
        folder = { label: segment, folders: new Map(), files: [] };
        parent.folders.set(segment, folder);
      }
      parent = folder;
    }
    parent.files.push({
      kind: 'file',
      label: fileLabel,
      file,
      comparisonGeneration,
      command: 'branchCompare.openDiff',
    });
  }

  return sortFolder(root);
}

function sortFolder(folder: MutableFolder): readonly TreeNode[] {
  const folders = [...folder.folders.values()]
    .sort((left, right) => compareLabels(left.label, right.label))
    .map((child) => ({
      kind: 'folder' as const,
      label: child.label,
      children: sortFolder(child),
    }));
  const files = [...folder.files].sort((left, right) => compareLabels(left.label, right.label));
  return [...folders, ...files];
}

function immutableChangedFile(file: ChangedFile): ChangedFile {
  return Object.freeze({
    status: file.status,
    oldPath: file.oldPath,
    newPath: file.newPath,
  });
}

function freezeNodes(nodes: readonly TreeNode[]): readonly TreeNode[] {
  return Object.freeze(nodes.map((node) => {
    if (node.kind !== 'folder') {
      return Object.freeze(node);
    }
    return Object.freeze({ ...node, children: freezeNodes(node.children) });
  }));
}

function repositoryDescription(repository: RepositorySnapshot | undefined): string {
  return repository?.currentBranch ?? 'Select a repository';
}

function displayRef(ref: string, refs: readonly GitRef[]): string {
  return refs.find((candidate) => candidate.fullName === ref)?.displayName
    ?? ref.replace(/^refs\/(?:heads|remotes)\//, '');
}

function errorMessage(error: Error): string {
  return error.message || 'Unable to compare branches. Select to retry.';
}

function compareLabels(left: string, right: string): number {
  const result = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  return result || (left < right ? -1 : left > right ? 1 : 0);
}
