import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { buildTreeModel, type CompareViewModel, type TreeModelInput, type ViewTreeNode } from '../tree/treeModel';
import { createWebviewDocument } from './webviewDocument';
import {
  parseWebviewMessage,
  type CompareViewAction,
  type ExtensionMessage,
  type WebviewMessage,
} from './viewProtocol';

interface TrustedDiffTarget {
  readonly target: Extract<CompareViewAction, { readonly type: 'openDiff' }>['target'];
  readonly generation: number;
}

export class CompareViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly onDidReceiveActionEmitter = new vscode.EventEmitter<CompareViewAction>();
  private readonly trustedTargets = new Map<string, TrustedDiffTarget>();
  private messageSubscription: vscode.Disposable | undefined;
  private webview: vscode.Webview | undefined;
  private model: CompareViewModel | undefined;
  private webviewReady = false;
  private disposed = false;

  public readonly onDidReceiveAction = this.onDidReceiveActionEmitter.event;

  public setInput(input: TreeModelInput): void {
    if (this.disposed) {
      return;
    }
    const model = buildTreeModel(input);
    this.model = model;
    this.rebuildTrustedTargets(model.nodes);
    this.postCurrentModel();
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    if (this.disposed) {
      return;
    }

    this.messageSubscription?.dispose();
    const webview = view.webview;
    webview.options = { ...webview.options, enableScripts: true };
    webview.html = createWebviewDocument({
      cspSource: webview.cspSource,
      nonce: createNonce(),
    });
    this.webview = webview;
    this.webviewReady = false;
    this.messageSubscription = webview.onDidReceiveMessage((value: unknown) => {
      if (this.disposed || this.webview !== webview) {
        return;
      }
      const message = parseWebviewMessage(value);
      if (message) {
        this.handleMessage(message);
      }
    });
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.messageSubscription?.dispose();
    this.messageSubscription = undefined;
    this.webview = undefined;
    this.webviewReady = false;
    this.trustedTargets.clear();
    this.onDidReceiveActionEmitter.dispose();
  }

  private handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'ready':
        this.webviewReady = true;
        this.postCurrentModel();
        return;
      case 'select-repository':
        this.onDidReceiveActionEmitter.fire({ type: 'selectRepository' });
        return;
      case 'select-base':
        this.onDidReceiveActionEmitter.fire({ type: 'selectBase' });
        return;
      case 'select-compare':
        this.onDidReceiveActionEmitter.fire({ type: 'selectCompare' });
        return;
      case 'toggle-unchanged':
        this.onDidReceiveActionEmitter.fire({ type: 'toggleUnchanged' });
        return;
      case 'open-diff': {
        const trusted = this.trustedTargets.get(message.nodeId);
        if (trusted?.generation === message.generation) {
          this.onDidReceiveActionEmitter.fire({
            type: 'openDiff',
            target: trusted.target,
            generation: trusted.generation,
          });
        }
      }
    }
  }

  private rebuildTrustedTargets(nodes: readonly ViewTreeNode[]): void {
    this.trustedTargets.clear();
    const visit = (items: readonly ViewTreeNode[]): void => {
      for (const node of items) {
        if (node.kind === 'folder') {
          visit(node.children);
        } else {
          this.trustedTargets.set(node.id, {
            target: node.target,
            generation: node.generation,
          });
        }
      }
    };
    visit(nodes);
  }

  private postCurrentModel(): void {
    if (!this.webviewReady || !this.webview || !this.model) {
      return;
    }
    const message: ExtensionMessage = { type: 'render', model: this.model };
    void this.webview.postMessage(message);
  }
}

function createNonce(): string {
  return randomBytes(18).toString('base64url');
}
