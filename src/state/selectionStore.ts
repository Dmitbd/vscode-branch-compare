import type { ComparisonSelection } from '../domain/model';

export interface WorkspaceState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export interface StoredSelection {
  readonly baseRef: string;
  readonly compareRef: string;
}

export type RefValidator = (ref: string) => boolean | PromiseLike<boolean>;

interface SelectionStorePayload {
  readonly version: 1;
  readonly byRepository: Record<string, StoredSelection>;
}

const storageKey = 'branchCompare.selection';

export class SelectionStore {
  public constructor(private readonly workspaceState: WorkspaceState) {}

  public async load(
    repositoryId: string,
    validateRef: RefValidator,
  ): Promise<StoredSelection | undefined> {
    const selection = this.readPayload().byRepository[repositoryId];
    if (!selection || !await validateRef(selection.baseRef) || !await validateRef(selection.compareRef)) {
      return undefined;
    }
    return Object.freeze({ ...selection });
  }

  public async save(repositoryId: string, selection: ComparisonSelection): Promise<void> {
    const payload = this.readPayload();
    const byRepository = {
      ...payload.byRepository,
      [repositoryId]: {
        baseRef: selection.baseRef,
        compareRef: selection.compareRef,
      },
    };
    await this.workspaceState.update(storageKey, { version: 1, byRepository });
  }

  public async clear(repositoryId: string): Promise<void> {
    const payload = this.readPayload();
    const { [repositoryId]: _selection, ...byRepository } = payload.byRepository;
    await this.workspaceState.update(storageKey, { version: 1, byRepository });
  }

  private readPayload(): SelectionStorePayload {
    try {
      const value = this.workspaceState.get<unknown>(storageKey);
      return isPayload(value) ? value : emptyPayload();
    } catch {
      return emptyPayload();
    }
  }
}

function emptyPayload(): SelectionStorePayload {
  return { version: 1, byRepository: {} };
}

function isPayload(value: unknown): value is SelectionStorePayload {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.byRepository)) {
    return false;
  }
  return Object.values(value.byRepository).every(isStoredSelection);
}

function isStoredSelection(value: unknown): value is StoredSelection {
  return isRecord(value)
    && typeof value.baseRef === 'string'
    && value.baseRef.length > 0
    && typeof value.compareRef === 'string'
    && value.compareRef.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
