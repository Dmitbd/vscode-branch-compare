import { beforeEach, describe, expect, test, vi } from 'vitest';

const commandCallbacks = new Map<string, (...args: unknown[]) => unknown>();
const registeredCommands: string[] = [];
let controllerConstructed = false;
let receiveViewAction: ((action: {
  readonly type: string;
  readonly target?: { readonly kind: 'unchanged'; readonly path: string };
  readonly generation?: number;
}) => unknown) | undefined;
const controller = {
  initialize: vi.fn(async () => undefined),
  selectRepository: vi.fn(async () => undefined),
  selectBase: vi.fn(async () => undefined),
  selectCompare: vi.fn(async () => undefined),
  fetch: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  swap: vi.fn(async () => undefined),
  toggleUnchanged: vi.fn(async () => undefined),
  openDiff: vi.fn(async () => undefined),
  dispose: vi.fn(),
};
const provider = {
  repositories: [],
  onDidOpenRepository: vi.fn(() => ({ dispose: vi.fn() })),
  onDidCloseRepository: vi.fn(() => ({ dispose: vi.fn() })),
};
const output = { appendLine: vi.fn(), show: vi.fn(), dispose: vi.fn() };
const compareView = { setInput: vi.fn(), dispose: vi.fn() };
const viewRegistration = { dispose: vi.fn() };
const viewActions = { dispose: vi.fn() };
const contentRegistration = { dispose: vi.fn() };

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => output),
    createTreeView: vi.fn(),
    registerWebviewViewProvider: vi.fn(() => viewRegistration),
    showQuickPick: vi.fn(),
    withProgress: vi.fn(async (_options, task) => task()),
    showErrorMessage: vi.fn(),
  },
  workspace: {
    registerTextDocumentContentProvider: vi.fn(() => contentRegistration),
  },
  commands: {
    registerCommand: vi.fn((command: string, callback: (...args: unknown[]) => unknown) => {
      registeredCommands.push(command);
      commandCallbacks.set(command, callback);
      return { dispose: vi.fn() };
    }),
  },
  ProgressLocation: { Notification: 15 },
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  CancellationTokenSource: class CancellationTokenSource {
    public readonly token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
    public cancel() {}
    public dispose() {}
  },
}));

vi.mock('../../src/repositories/repositoryProvider', () => ({
  RepositoryProvider: { create: vi.fn(async () => provider) },
}));
vi.mock('../../src/git/gitAdapter', () => ({ DefaultGitAdapter: class DefaultGitAdapter {} }));
vi.mock('../../src/compare/comparisonService', () => ({ ComparisonService: class ComparisonService {} }));
vi.mock('../../src/state/selectionStore', () => ({ SelectionStore: class SelectionStore {} }));
vi.mock('../../src/view/compareViewProvider', () => ({
  CompareViewProvider: class CompareViewProvider {
    public setInput = compareView.setInput;
    public dispose = compareView.dispose;
    public onDidReceiveAction(listener: typeof receiveViewAction) {
      if (!controllerConstructed) {
        throw new Error('CompareController must exist before view actions are handled.');
      }
      receiveViewAction = listener;
      return viewActions;
    }
  },
}));
vi.mock('../../src/content/gitContentProvider', () => ({
  GitContentProvider: class GitContentProvider {},
  openFullDiff: vi.fn(async () => undefined),
}));
vi.mock('../../src/controller/compareController', () => ({
  CompareController: class CompareController {
    public constructor() {
      controllerConstructed = true;
    }
    public initialize = controller.initialize;
    public selectRepository = controller.selectRepository;
    public selectBase = controller.selectBase;
    public selectCompare = controller.selectCompare;
    public fetch = controller.fetch;
    public refresh = controller.refresh;
    public swap = controller.swap;
    public toggleUnchanged = controller.toggleUnchanged;
    public openDiff = controller.openDiff;
    public dispose = controller.dispose;
  },
}));

import { activate } from '../../src/extension';

describe('extension activation', () => {
  beforeEach(() => {
    registeredCommands.length = 0;
    commandCallbacks.clear();
    controllerConstructed = false;
    receiveViewAction = undefined;
    controller.initialize.mockClear();
    controller.selectRepository.mockClear();
    controller.selectBase.mockClear();
    controller.selectCompare.mockClear();
    controller.toggleUnchanged.mockClear();
    controller.openDiff.mockClear();
    compareView.dispose.mockClear();
    viewRegistration.dispose.mockClear();
    viewActions.dispose.mockClear();
  });

  test('registers the comparison webview and routes its trusted actions', async () => {
    const context = {
      subscriptions: [] as { dispose(): unknown }[],
      workspaceState: { get: vi.fn(), update: vi.fn(async () => undefined) },
      extensionMode: 1,
    };

    await activate(context as never);

    expect(registeredCommands).toEqual([
      'branchCompare.selectRepository',
      'branchCompare.selectBase',
      'branchCompare.selectCompare',
      'branchCompare.fetch',
      'branchCompare.refresh',
      'branchCompare.swap',
    ]);
    const vscode = await import('vscode');
    expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
      'branchCompare.view',
      expect.objectContaining({ setInput: expect.any(Function) }),
      { webviewOptions: { retainContextWhenHidden: true } },
    );
    expect(vscode.window.createTreeView).not.toHaveBeenCalled();
    const registeredProvider = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls[0]?.[1];
    expect(contentRegistration.dispose).not.toHaveBeenCalled();
    expect(context.subscriptions).toContain(output);
    expect(context.subscriptions).toContain(registeredProvider);
    expect(context.subscriptions).toContain(viewRegistration);
    expect(context.subscriptions).toContain(viewActions);
    expect(context.subscriptions).toContain(contentRegistration);
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(13);
    expect(controller.initialize).toHaveBeenCalledOnce();

    const target = { kind: 'unchanged', path: 'src/unchanged.ts' } as const;
    receiveViewAction?.({ type: 'selectRepository' });
    receiveViewAction?.({ type: 'selectBase' });
    receiveViewAction?.({ type: 'selectCompare' });
    receiveViewAction?.({ type: 'toggleUnchanged' });
    receiveViewAction?.({ type: 'openDiff', target, generation: 7 });

    expect(controller.selectRepository).toHaveBeenCalledOnce();
    expect(controller.selectBase).toHaveBeenCalledOnce();
    expect(controller.selectCompare).toHaveBeenCalledOnce();
    expect(controller.toggleUnchanged).toHaveBeenCalledOnce();
    expect(controller.openDiff).toHaveBeenCalledWith(target, 7);
  });
});
