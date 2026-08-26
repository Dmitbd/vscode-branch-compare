import type { DiffTarget } from '../domain/model';
import type { CompareViewModel } from '../tree/treeModel';

export type WebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'select-repository' }
  | { readonly type: 'select-base' }
  | { readonly type: 'select-compare' }
  | { readonly type: 'toggle-unchanged' }
  | { readonly type: 'refresh' }
  | { readonly type: 'open-diff'; readonly nodeId: string; readonly generation: number };

export type CompareViewAction =
  | { readonly type: 'selectRepository' }
  | { readonly type: 'selectBase' }
  | { readonly type: 'selectCompare' }
  | { readonly type: 'toggleUnchanged' }
  | { readonly type: 'refresh' }
  | { readonly type: 'openDiff'; readonly target: DiffTarget; readonly generation: number };

export type ExtensionMessage = { readonly type: 'render'; readonly model: CompareViewModel };

export function parseWebviewMessage(value: unknown): WebviewMessage | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }

  switch (value.type) {
    case 'ready':
    case 'select-repository':
    case 'select-base':
    case 'select-compare':
    case 'toggle-unchanged':
    case 'refresh':
      return hasOnlyKeys(value, ['type']) ? { type: value.type } : undefined;
    case 'open-diff':
      return hasOnlyKeys(value, ['type', 'nodeId', 'generation'])
        && typeof value.nodeId === 'string'
        && value.nodeId.length > 0
        && typeof value.generation === 'number'
        && Number.isSafeInteger(value.generation)
        && value.generation >= 0
        ? { type: 'open-diff', nodeId: value.nodeId, generation: value.generation }
        : undefined;
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
