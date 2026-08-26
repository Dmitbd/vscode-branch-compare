import { describe, expect, test, vi } from 'vitest';

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private readonly listeners = new Set<(value: T) => void>();
    public readonly event = (
      listener: (value: T) => void,
      thisArgs?: unknown,
      disposables?: Array<{ dispose(): unknown }>,
    ) => {
      const callback = thisArgs ? listener.bind(thisArgs) : listener;
      this.listeners.add(callback);
      const disposable = { dispose: () => this.listeners.delete(callback) };
      disposables?.push(disposable);
      return disposable;
    };

    public fire(value: T): void {
      for (const listener of this.listeners) {
        listener(value);
      }
    }

    public dispose(): void {
      this.listeners.clear();
    }
  }

  return { EventEmitter };
});

import type * as vscode from 'vscode';
import type { ComparisonResult, ComparisonSelection } from '../../src/domain/model';
import type { RepositorySnapshot } from '../../src/repositories/repositoryProvider';
import type { TreeModelInput } from '../../src/tree/treeModel';
import { CompareViewProvider } from '../../src/view/compareViewProvider';

const selection: ComparisonSelection = {
  repositoryUri: 'file:///workspace/project',
  baseRef: 'refs/heads/main',
  compareRef: 'refs/heads/feature',
};

const repository = {
  id: 'repo-1',
  label: 'project',
  rootUri: { toString: () => selection.repositoryUri },
  currentBranch: 'feature',
  remotes: ['origin'],
} as unknown as RepositorySnapshot;

function input(generation: number, path = 'src/file.ts'): TreeModelInput {
  const result: ComparisonResult = {
    selection,
    baseSha: 'a'.repeat(40),
    compareSha: 'b'.repeat(40),
    mergeBaseSha: 'c'.repeat(40),
    files: [{
      status: 'modified',
      oldPath: path,
      newPath: path,
      lineChanges: { additions: 3, deletions: 2 },
    }],
    summary: { files: 1, additions: 3, deletions: 2 },
  };
  return {
    repositories: [repository],
    repository,
    refs: [
      { fullName: selection.baseRef, displayName: 'main', kind: 'local', commit: result.baseSha },
      { fullName: selection.compareRef, displayName: 'feature', kind: 'local', commit: result.compareSha },
    ],
    selection,
    result,
    comparisonGeneration: generation,
  };
}

function webviewHarness() {
  let receive: ((message: unknown) => void) | undefined;
  const messageSubscription = { dispose: vi.fn() };
  const webview = {
    cspSource: 'vscode-webview:',
    options: {},
    html: '',
    postMessage: vi.fn(async () => true),
    onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => {
      receive = listener;
      return messageSubscription;
    }),
  };
  return {
    view: { webview } as unknown as vscode.WebviewView,
    webview,
    messageSubscription,
    send(message: unknown) {
      if (!receive) {
        throw new Error('Webview message listener has not been registered.');
      }
      receive(message);
    },
  };
}

describe('CompareViewProvider', () => {
  test('publishes the latest model after the resolved webview reports ready', () => {
    const provider = new CompareViewProvider();
    provider.setInput(input(7));
    const h = webviewHarness();

    provider.resolveWebviewView(h.view);

    expect(h.webview.options).toEqual({ enableScripts: true });
    expect(h.webview.html).toContain("default-src 'none'");
    expect(h.webview.postMessage).not.toHaveBeenCalled();

    provider.setInput(input(8, 'src/new.ts'));
    h.send({ type: 'ready' });

    expect(h.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(h.webview.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'render',
      model: expect.objectContaining({
        branches: { base: 'main', compare: 'feature' },
        nodes: expect.any(Array),
      }),
    }));
  });

  test('publishes a serializable retryable complete-tree error while retaining changed nodes', () => {
    const provider = new CompareViewProvider();
    const h = webviewHarness();
    provider.setInput({
      ...input(7),
      completeTreeError: Object.assign(
        new Error('Unable to load all files; try again'),
        { technicalError: new Error('raw ls-tree output') },
      ),
    });
    provider.resolveWebviewView(h.view);

    h.send({ type: 'ready' });

    expect(h.webview.postMessage).toHaveBeenCalledWith({
      type: 'render',
      model: expect.objectContaining({
        completeTreeError: 'Unable to load all files; try again',
        canRetryCompleteTree: true,
        nodes: expect.arrayContaining([expect.any(Object)]),
      }),
    });
    expect(JSON.stringify(h.webview.postMessage.mock.calls)).not.toContain('raw ls-tree output');
  });

  test('emits only exact validated selection, filter, and local refresh actions', () => {
    const provider = new CompareViewProvider();
    const h = webviewHarness();
    const actions: unknown[] = [];
    provider.onDidReceiveAction((action) => actions.push(action));
    provider.resolveWebviewView(h.view);

    h.send({ type: 'select-repository' });
    h.send({ type: 'select-base' });
    h.send({ type: 'select-compare' });
    h.send({ type: 'toggle-unchanged' });
    h.send({ type: 'refresh' });
    h.send(null);
    h.send({ type: 'select-base', unexpected: true });
    h.send({ type: 42 });
    h.send({ type: 'open-diff', nodeId: 1, generation: 7 });

    expect(actions).toEqual([
      { type: 'selectRepository' },
      { type: 'selectBase' },
      { type: 'selectCompare' },
      { type: 'toggleUnchanged' },
      { type: 'refresh' },
    ]);
  });

  test('resolves openDiff only through the current extension-owned node map', () => {
    const provider = new CompareViewProvider();
    const h = webviewHarness();
    const actions: unknown[] = [];
    provider.onDidReceiveAction((action) => actions.push(action));
    provider.setInput(input(7));
    provider.resolveWebviewView(h.view);

    h.send({
      type: 'open-diff',
      nodeId: 'changed:src/file.ts',
      generation: 7,
      target: { kind: 'unchanged', path: '/forged' },
    });
    h.send({ type: 'open-diff', nodeId: 'changed:unknown.ts', generation: 7 });
    h.send({ type: 'open-diff', nodeId: 'changed:src/file.ts', generation: 6 });
    h.send({ type: 'open-diff', nodeId: 'changed:src/file.ts', generation: 7 });

    expect(actions).toEqual([{
      type: 'openDiff',
      target: {
        kind: 'changed',
        file: expect.objectContaining({ newPath: 'src/file.ts' }),
      },
      generation: 7,
    }]);

    provider.setInput(input(8));
    h.send({ type: 'open-diff', nodeId: 'changed:src/file.ts', generation: 7 });
    expect(actions).toHaveLength(1);
  });

  test('posts later inputs to a ready view and disposes message and action subscriptions', () => {
    const provider = new CompareViewProvider();
    const h = webviewHarness();
    const actions: unknown[] = [];
    provider.onDidReceiveAction((action) => actions.push(action));
    provider.resolveWebviewView(h.view);
    h.send({ type: 'ready' });
    provider.setInput(input(9));

    expect(h.webview.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'render' }));

    provider.dispose();
    expect(h.messageSubscription.dispose).toHaveBeenCalledTimes(1);
    h.send({ type: 'select-base' });
    expect(actions).toEqual([]);
  });
});
