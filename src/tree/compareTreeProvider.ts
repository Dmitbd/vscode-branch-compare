import * as vscode from 'vscode';
import { buildTreeModel, type FileTreeNode, type TreeModelInput, type TreeNode } from './treeModel';

const statusPresentation = {
  modified: { label: 'M', color: 'gitDecoration.modifiedResourceForeground' },
  added: { label: 'A', color: 'gitDecoration.addedResourceForeground' },
  deleted: { label: 'D', color: 'gitDecoration.deletedResourceForeground' },
  renamed: { label: 'R', color: 'gitDecoration.renamedResourceForeground' },
} as const;

export class CompareTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  private model: readonly TreeNode[];

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(input: TreeModelInput) {
    this.model = buildTreeModel(input);
  }

  public setInput(input: TreeModelInput): void {
    this.model = buildTreeModel(input);
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(node: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, node.kind === 'folder'
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None);
    item.description = node.kind === 'file'
      ? statusPresentation[node.file.status].label
      : node.description;
    item.tooltip = node.kind === 'file' ? fileTooltip(node) : node.label;
    item.contextValue = `branchCompare.${node.kind}`;
    item.command = commandFor(node);
    item.iconPath = iconFor(node);
    return item;
  }

  public getChildren(node?: TreeNode): TreeNode[] {
    if (!node) {
      return [...this.model];
    }
    return node.kind === 'folder' ? [...node.children] : [];
  }

  public dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}

function commandFor(node: TreeNode): vscode.Command | undefined {
  if (!node.command) {
    return undefined;
  }
  return node.kind === 'file'
    ? { command: node.command, title: 'Open Diff', arguments: [node] }
    : { command: node.command, title: node.label };
}

function iconFor(node: TreeNode): vscode.ThemeIcon | undefined {
  if (node.kind === 'file') {
    const presentation = statusPresentation[node.file.status];
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(presentation.color));
  }
  if (node.kind === 'folder') {
    return vscode.ThemeIcon.Folder;
  }
  if (node.kind === 'message' && node.command) {
    return new vscode.ThemeIcon('refresh');
  }
  return undefined;
}

function fileTooltip(node: FileTreeNode): string {
  const status = statusPresentation[node.file.status].label;
  const path = node.file.newPath ?? node.file.oldPath ?? node.label;
  return `${status} ${path}`;
}
