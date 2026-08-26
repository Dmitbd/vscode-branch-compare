import * as vscode from 'vscode';
import { ComparisonService } from './compare/comparisonService';
import { CompareController, type CompareControllerUi } from './controller/compareController';
import { GitContentProvider, openFullDiff } from './content/gitContentProvider';
import { BRANCH_COMPARE_SCHEME } from './content/virtualUri';
import type { GitRef } from './domain/model';
import { DefaultGitAdapter } from './git/gitAdapter';
import { RepositoryProvider, type RepositorySnapshot } from './repositories/repositoryProvider';
import { SelectionStore } from './state/selectionStore';
import { CompareViewProvider } from './view/compareViewProvider';

interface BranchCompareTestApi {
  openFirstDiff(baseRef: string, compareRef: string): Promise<{
    readonly schemes: readonly string[];
    readonly dirty: readonly boolean[];
    readonly languageIds: readonly string[];
  }>;
}

export async function activate(context: vscode.ExtensionContext): Promise<BranchCompareTestApi | undefined> {
  const output = vscode.window.createOutputChannel('Branch Compare');
  const repositories = await RepositoryProvider.create();
  const git = new DefaultGitAdapter();
  const comparisonService = new ComparisonService(git);
  const selectionStore = new SelectionStore(context.workspaceState);
  const compareView = new CompareViewProvider();
  const contentProvider = new GitContentProvider(git, repositories);
  const contentRegistration = vscode.workspace.registerTextDocumentContentProvider(
    BRANCH_COMPARE_SCHEME,
    contentProvider,
  );
  const controller = new CompareController({
    repositories,
    git,
    comparisonService,
    selectionStore,
    tree: compareView,
    ui: createUi(),
    output,
    createCancellationTokenSource: () => new vscode.CancellationTokenSource(),
    openDiff: openFullDiff,
  });
  const viewActions = compareView.onDidReceiveAction((action) => {
    switch (action.type) {
      case 'selectRepository': return void controller.selectRepository();
      case 'selectBase': return void controller.selectBase();
      case 'selectCompare': return void controller.selectCompare();
      case 'toggleUnchanged': return void controller.toggleUnchanged();
      case 'refresh': return void controller.refresh();
      case 'openDiff': return void controller.openDiff(action.target, action.generation);
    }
  });
  const viewRegistration = vscode.window.registerWebviewViewProvider(
    'branchCompare.view',
    compareView,
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  const commands = [
    vscode.commands.registerCommand('branchCompare.selectRepository', () => controller.selectRepository()),
    vscode.commands.registerCommand('branchCompare.selectBase', () => controller.selectBase()),
    vscode.commands.registerCommand('branchCompare.selectCompare', () => controller.selectCompare()),
    vscode.commands.registerCommand('branchCompare.fetch', () => controller.fetch()),
    vscode.commands.registerCommand('branchCompare.refresh', () => controller.refresh()),
    vscode.commands.registerCommand('branchCompare.swap', () => controller.swap()),
  ];
  const repositoryOpened = repositories.onDidOpenRepository(() => { void controller.repositoriesChanged(); });
  const repositoryClosed = repositories.onDidCloseRepository(() => { void controller.repositoriesChanged(); });

  context.subscriptions.push(
    output,
    compareView,
    viewRegistration,
    viewActions,
    contentRegistration,
    controller,
    repositoryOpened,
    repositoryClosed,
    ...commands,
  );
  await controller.initialize();

  if (context.extensionMode !== vscode.ExtensionMode.Test) {
    return undefined;
  }
  return {
    async openFirstDiff(baseRef, compareRef) {
      const repository = await waitForFirstRepository(repositories);
      const result = await controller.compareRefsForTesting(repository.id, baseRef, compareRef);
      const file = result.files[0];
      if (!file) {
        throw new Error('The extension-host fixture comparison has no changed file.');
      }
      await openFullDiff(repository.id, result, { kind: 'changed', file }, shortRef(baseRef), shortRef(compareRef));
      const documents = vscode.workspace.textDocuments
        .filter((document) => document.uri.scheme === BRANCH_COMPARE_SCHEME)
        .slice(-2);
      return {
        schemes: documents.map((document) => document.uri.scheme),
        dirty: documents.map((document) => document.isDirty),
        languageIds: documents.map((document) => document.languageId),
      };
    },
  };
}

export function deactivate(): void {}

function createUi(): CompareControllerUi {
  return {
    async pickRepository(items) {
      const picked = await vscode.window.showQuickPick([...items], {
        title: 'Select a Git repository',
        placeHolder: 'Repository to compare',
        matchOnDescription: true,
      });
      return picked?.repository as RepositorySnapshot | undefined;
    },
    async pickRef(items, role) {
      const picked = await vscode.window.showQuickPick([...items], {
        title: `Select ${role} branch`,
        placeHolder: `${role} branch`,
        matchOnDescription: true,
        matchOnDetail: true,
      });
      return picked?.ref as GitRef | undefined;
    },
    async withProgress(title, task) {
      return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      }, task);
    },
    async showError(message, action) {
      if (!action) {
        await vscode.window.showErrorMessage(message);
        return undefined;
      }
      return vscode.window.showErrorMessage(message, action);
    },
  };
}

function shortRef(ref: string): string {
  return ref.replace(/^refs\/(?:heads|remotes)\//, '');
}

function waitForFirstRepository(repositories: RepositoryProvider): Promise<RepositorySnapshot> {
  const existing = repositories.repositories[0];
  if (existing) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      reject(new Error('The extension-host fixture repository was not discovered.'));
    }, 10_000);
    const disposable = repositories.onDidOpenRepository((repository) => {
      clearTimeout(timeout);
      disposable.dispose();
      resolve(repository);
    });
    const openedDuringSubscription = repositories.repositories[0];
    if (openedDuringSubscription) {
      clearTimeout(timeout);
      disposable.dispose();
      resolve(openedDuringSubscription);
    }
  });
}
