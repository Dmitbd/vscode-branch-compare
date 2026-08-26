import { beforeEach, describe, expect, test, vi } from 'vitest';

const commandCallbacks = new Map<string, (...args: unknown[]) => unknown>();
const registeredCommands: string[] = [];
const controller = {
  initialize: vi.fn(async () => undefined),
  selectRepository: vi.fn(async () => undefined),
  selectBase: vi.fn(async () => undefined),
  selectCompare: vi.fn(async () => undefined),
  fetch: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  swap: vi.fn(async () => undefined),
  openDiff: vi.fn(async () => undefined),
  dispose: vi.fn(),
};
const provider = {
  repositories: [],
  onDidOpenRepository: vi.fn(() => ({ dispose: vi.fn() })),
  onDidCloseRepository: vi.fn(() => ({ dispose: vi.fn() })),
};
const output = { appendLine: vi.fn(), show: vi.fn(), dispose: vi.fn() };
const treeView = { dispose: vi.fn() };
const contentRegistration = { dispose: vi.fn() };

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => output),
    createTreeView: vi.fn(() => treeView),
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
vi.mock('../../src/tree/compareTreeProvider', () => ({
  CompareTreeProvider: class CompareTreeProvider {
    public setInput() {}
    public dispose() {}
  },
}));
vi.mock('../../src/content/gitContentProvider', () => ({
  GitContentProvider: class GitContentProvider {},
  openFullDiff: vi.fn(async () => undefined),
}));
vi.mock('../../src/controller/compareController', () => ({
  CompareController: class CompareController {
    public initialize = controller.initialize;
    public selectRepository = controller.selectRepository;
    public selectBase = controller.selectBase;
    public selectCompare = controller.selectCompare;
    public fetch = controller.fetch;
    public refresh = controller.refresh;
    public swap = controller.swap;
    public openDiff = controller.openDiff;
    public dispose = controller.dispose;
  },
}));

import { activate } from '../../src/extension';

describe('extension activation', () => {
  beforeEach(() => {
    registeredCommands.length = 0;
    commandCallbacks.clear();
    controller.initialize.mockClear();
  });

  test('wires every read-only command, tree, content provider, and disposable', async () => {
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
      'branchCompare.openDiff',
    ]);
    expect(contentRegistration.dispose).not.toHaveBeenCalled();
    expect(context.subscriptions).toContain(output);
    expect(context.subscriptions).toContain(treeView);
    expect(context.subscriptions).toContain(contentRegistration);
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(13);
    expect(controller.initialize).toHaveBeenCalledOnce();

    expect(() => commandCallbacks.get('branchCompare.openDiff')?.()).not.toThrow();
    expect(controller.openDiff).not.toHaveBeenCalled();
  });
});
