import { describe, expect, test, vi } from 'vitest';
import type { ComparisonSelection } from '../../src/domain/model';
import { SelectionStore, type WorkspaceState } from '../../src/state/selectionStore';

const repositoryId = '3c58ea86c12cfe87';
const selection: ComparisonSelection = {
  repositoryUri: 'branch-compare://repository/3c58ea86c12cfe87',
  baseRef: 'refs/remotes/origin/main',
  compareRef: 'refs/heads/feature/selection',
};

function workspaceState(initialValue?: unknown): WorkspaceState & { readonly update: ReturnType<typeof vi.fn> } {
  let value = initialValue;
  return {
    get: () => value,
    update: vi.fn(async (_key: string, nextValue: unknown) => {
      value = nextValue;
    }),
  };
}

describe('SelectionStore', () => {
  test('saves and loads branch refs independently for each repository', async () => {
    const state = workspaceState();
    const store = new SelectionStore(state);
    const secondSelection = { ...selection, baseRef: 'refs/heads/develop', compareRef: 'refs/heads/release' };

    await store.save(repositoryId, selection);
    await store.save('ad4e6f66f40b542c', secondSelection);

    await expect(store.load(repositoryId, () => true)).resolves.toEqual({
      baseRef: selection.baseRef,
      compareRef: selection.compareRef,
    });
    await expect(store.load('ad4e6f66f40b542c', () => true)).resolves.toEqual({
      baseRef: secondSelection.baseRef,
      compareRef: secondSelection.compareRef,
    });
  });

  test('rejects stale saved refs through the supplied validator', async () => {
    const state = workspaceState({
      version: 1,
      byRepository: {
        [repositoryId]: { baseRef: selection.baseRef, compareRef: selection.compareRef },
      },
    });
    const store = new SelectionStore(state);
    const validateRef = vi.fn(async (ref: string) => ref !== selection.baseRef);

    await expect(store.load(repositoryId, validateRef)).resolves.toBeUndefined();
    expect(validateRef).toHaveBeenCalledWith(selection.baseRef);
    expect(validateRef).not.toHaveBeenCalledWith(selection.compareRef);
  });

  test('ignores malformed stored data without throwing', async () => {
    const state = workspaceState({ version: 2, byRepository: 'not a record' });
    const store = new SelectionStore(state);

    await expect(store.load(repositoryId, () => true)).resolves.toBeUndefined();
  });

  test('persists only versioned refs and removes a single repository selection', async () => {
    const state = workspaceState();
    const store = new SelectionStore(state);

    await store.save(repositoryId, { ...selection, ...{ baseSha: 'a'.repeat(40), compareSha: 'b'.repeat(40) } });
    const savedPayload = state.update.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(savedPayload).toEqual({
      version: 1,
      byRepository: {
        [repositoryId]: { baseRef: selection.baseRef, compareRef: selection.compareRef },
      },
    });
    expect(JSON.stringify(savedPayload)).not.toContain('repositoryUri');
    expect(JSON.stringify(savedPayload)).not.toContain('baseSha');
    expect(JSON.stringify(savedPayload)).not.toContain('compareSha');

    await store.clear(repositoryId);

    await expect(store.load(repositoryId, () => true)).resolves.toBeUndefined();
  });
});
