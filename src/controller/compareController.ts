import type { CancellationToken } from 'vscode';
import type { ComparisonResult, ComparisonSelection, DiffTarget, GitRef } from '../domain/model';
import type { GitAdapter } from '../git/gitAdapter';
import { GitCommandCancelledError } from '../git/commandRunner';
import type { RepositorySnapshot } from '../repositories/repositoryProvider';
import type { TreeModelInput } from '../tree/treeModel';
import { technicalErrorText, toUserFacingError, UserFacingError } from '../errors/userFacingError';

export interface ControllerCancellationTokenSource {
  readonly token: CancellationToken;
  cancel(): void;
  dispose(): void;
}

export interface RepositoryPickItem {
  readonly label: string;
  readonly description: string;
  readonly repository: RepositorySnapshot;
}

export interface RefPickItem {
  readonly label: string;
  readonly description: string;
  readonly detail: string;
  readonly ref: GitRef;
}

export interface CompareControllerUi {
  pickRepository(items: readonly RepositoryPickItem[]): Promise<RepositorySnapshot | undefined>;
  pickRef(items: readonly RefPickItem[], role: 'BASE' | 'COMPARE'): Promise<GitRef | undefined>;
  withProgress<T>(title: string, task: () => Promise<T>): Promise<T>;
  showError(message: string, action?: 'Show Output'): Promise<'Show Output' | undefined>;
}

export interface ControllerDependencies {
  readonly repositories: { readonly repositories: readonly RepositorySnapshot[] };
  readonly git: Pick<GitAdapter, 'listRefs' | 'findRemoteHead' | 'fetch'>;
  readonly comparisonService: {
    compare(root: string, selection: ComparisonSelection, token?: CancellationToken): Promise<ComparisonResult>;
  };
  readonly selectionStore: {
    load(repositoryId: string, validateRef: (ref: string) => boolean): Promise<{
      readonly baseRef: string;
      readonly compareRef: string;
    } | undefined>;
    save(repositoryId: string, selection: ComparisonSelection): Promise<void>;
  };
  readonly tree: { setInput(input: TreeModelInput): void };
  readonly ui: CompareControllerUi;
  readonly output: { appendLine(value: string): void; show(preserveFocus?: boolean): void };
  readonly createCancellationTokenSource: () => ControllerCancellationTokenSource;
  readonly openDiff?: (
    repositoryId: string,
    result: ComparisonResult,
    target: DiffTarget,
    baseLabel: string,
    compareLabel: string,
  ) => Promise<void>;
}

export class CompareController {
  private repository: RepositorySnapshot | undefined;
  private refs: readonly GitRef[] = [];
  private baseRef: string | undefined;
  private compareRef: string | undefined;
  private selection: ComparisonSelection | undefined;
  private result: ComparisonResult | undefined;
  private error: UserFacingError | undefined;
  private loading = false;
  private generation = 0;
  private activeSource: ControllerCancellationTokenSource | undefined;

  public constructor(private readonly dependencies: ControllerDependencies) {}

  public async initialize(): Promise<void> {
    const repositories = this.dependencies.repositories.repositories;
    if (repositories.length === 0) {
      this.error = new UserFacingError('No repositories found');
      this.render();
      return;
    }
    if (repositories.length === 1) {
      await this.activateRepository(repositories[0]);
      return;
    }
    await this.selectRepository();
  }

  public async selectRepository(): Promise<void> {
    const repositories = this.dependencies.repositories.repositories;
    if (repositories.length === 0) {
      this.error = new UserFacingError('No repositories found');
      this.render();
      return;
    }
    const repository = repositories.length === 1
      ? repositories[0]
      : await this.dependencies.ui.pickRepository(repositories.map(repositoryPickItem));
    if (repository) {
      await this.activateRepository(repository);
    }
  }

  public async repositoriesChanged(): Promise<void> {
    const repositories = this.dependencies.repositories.repositories;
    const current = this.repository
      ? repositories.find((repository) => repository.id === this.repository?.id)
      : undefined;
    if (current) {
      this.repository = current;
      this.render();
      return;
    }

    this.invalidateOperation();
    this.repository = undefined;
    this.refs = [];
    this.baseRef = undefined;
    this.compareRef = undefined;
    this.selection = undefined;
    this.result = undefined;
    this.loading = false;
    this.error = repositories.length === 0 ? new UserFacingError('No repositories found') : undefined;
    this.render();

    if (repositories.length === 1) {
      await this.activateRepository(repositories[0]);
    }
  }

  public async selectBase(): Promise<void> {
    await this.selectRef('BASE');
  }

  public async selectCompare(): Promise<void> {
    await this.selectRef('COMPARE');
  }

  public async refresh(): Promise<void> {
    if (!this.repository || !this.selection) {
      this.renderSelectionError();
      return;
    }
    await this.recompute(true);
  }

  public async fetch(): Promise<void> {
    if (!this.repository || !this.selection) {
      this.renderSelectionError();
      return;
    }

    const repository = this.repository;
    const selection = this.selection;
    const generation = this.startOperation();
    const source = this.activeSource;
    this.loading = true;
    this.error = undefined;
    this.render();
    try {
      await this.dependencies.ui.withProgress('Fetching branch updates…', async () => {
        for (const remote of selectedRemotes(repository, this.refs, selection)) {
          await this.dependencies.git.fetch(repository.rootUri.fsPath, remote, source?.token);
        }
      });
      if (!this.isCurrent(generation, selection, repository)) {
        return;
      }
      await this.recomputeWithinOperation(generation, repository, selection, true, source?.token);
    } catch (error) {
      if (!this.isCurrent(generation, selection, repository) || isCancellation(error)) {
        return;
      }
      this.loading = false;
      this.error = undefined;
      this.logError(error);
      this.render();
      const action = await this.dependencies.ui.showError(
        'Fetch failed; the previous comparison is still shown',
        'Show Output',
      );
      if (action === 'Show Output') {
        this.dependencies.output.show(true);
      }
    }
  }

  public async swap(): Promise<void> {
    if (!this.repository || !this.selection) {
      this.renderSelectionError();
      return;
    }
    this.selection = Object.freeze({
      ...this.selection,
      baseRef: this.selection.compareRef,
      compareRef: this.selection.baseRef,
    });
    this.baseRef = this.selection.baseRef;
    this.compareRef = this.selection.compareRef;
    const repository = this.repository;
    const selection = this.selection;
    const generation = this.invalidateOperation();
    await this.dependencies.selectionStore.save(repository.id, selection);
    if (!this.isCurrent(generation, selection, repository)) {
      return;
    }
    await this.recompute(false);
  }

  public async openDiff(target: DiffTarget, comparisonGeneration: number): Promise<void> {
    if (
      comparisonGeneration !== this.generation
      || !this.repository
      || !this.result
      || !this.dependencies.openDiff
    ) {
      return;
    }
    try {
      await this.dependencies.openDiff(
        this.repository.id,
        this.result,
        target,
        displayRef(this.selection?.baseRef, this.refs),
        displayRef(this.selection?.compareRef, this.refs),
      );
    } catch (error) {
      const userError = toUserFacingError(error);
      this.logError(error);
      const action = await this.dependencies.ui.showError(userError.message, 'Show Output');
      if (action === 'Show Output') {
        this.dependencies.output.show(true);
      }
    }
  }

  public async compareRefsForTesting(
    repositoryId: string,
    baseRef: string,
    compareRef: string,
  ): Promise<ComparisonResult> {
    const repository = this.dependencies.repositories.repositories
      .find((candidate) => candidate.id === repositoryId);
    if (!repository) {
      throw new UserFacingError('No repositories found');
    }
    const refs = await this.dependencies.git.listRefs(repository.rootUri.fsPath);
    if (!refs.some((ref) => ref.fullName === baseRef) || !refs.some((ref) => ref.fullName === compareRef)) {
      throw new UserFacingError('The selected branch no longer exists');
    }
    return this.dependencies.comparisonService.compare(
      repository.rootUri.fsPath,
      createSelection(repository, baseRef, compareRef),
    );
  }

  public dispose(): void {
    this.activeSource?.cancel();
    this.activeSource?.dispose();
    this.activeSource = undefined;
  }

  private async activateRepository(repository: RepositorySnapshot): Promise<void> {
    this.repository = repository;
    this.refs = [];
    this.baseRef = undefined;
    this.compareRef = undefined;
    this.selection = undefined;
    this.result = undefined;
    this.error = undefined;
    await this.initializeSelection();
  }

  private async initializeSelection(): Promise<void> {
    const repository = this.repository;
    if (!repository) {
      return;
    }
    const generation = this.startOperation();
    const source = this.activeSource;
    this.loading = true;
    this.render();
    try {
      const refs = await this.dependencies.git.listRefs(repository.rootUri.fsPath, source?.token);
      if (!this.isCurrent(generation, undefined, repository)) {
        return;
      }
      this.refs = refs;
      const refNames = new Set(refs.map((ref) => ref.fullName));
      const stored = await this.dependencies.selectionStore.load(repository.id, (ref) => refNames.has(ref));
      if (!this.isCurrent(generation, undefined, repository)) {
        return;
      }
      const defaults = stored ?? await this.defaultSelection(repository, refs, source?.token);
      if (!this.isCurrent(generation, undefined, repository)) {
        return;
      }
      this.baseRef = defaults.baseRef;
      this.compareRef = defaults.compareRef;
      if (!this.baseRef || !this.compareRef) {
        this.loading = false;
        this.error = new UserFacingError(this.baseRef ? 'Select a compare branch' : 'Select a base branch');
        this.render();
        return;
      }
      const selection = createSelection(repository, this.baseRef, this.compareRef);
      this.selection = selection;
      await this.dependencies.selectionStore.save(repository.id, selection);
      if (!this.isCurrent(generation, selection, repository)) {
        return;
      }
      await this.compareWithinOperation(generation, repository, selection, source?.token);
    } catch (error) {
      this.applyComparisonError(generation, undefined, repository, error);
    }
  }

  private async defaultSelection(
    repository: RepositorySnapshot,
    refs: readonly GitRef[],
    token?: CancellationToken,
  ): Promise<{ readonly baseRef?: string; readonly compareRef?: string }> {
    const compare = refs.find((ref) => (
      ref.kind === 'local' && ref.fullName === `refs/heads/${repository.currentBranch ?? ''}`
    ));

    const remote = defaultRemote(repository.remotes);
    let base: GitRef | undefined;
    if (remote) {
      const remoteHead = await this.dependencies.git.findRemoteHead(repository.rootUri.fsPath, remote, token);
      base = refs.find((ref) => ref.fullName === remoteHead);
      base ??= firstExistingRef(refs, [
        `refs/remotes/${remote}/main`,
        `refs/remotes/${remote}/master`,
        `refs/remotes/${remote}/develop`,
      ]);
    }
    base ??= firstExistingRef(refs, [
      'refs/heads/main',
      'refs/heads/master',
      'refs/heads/develop',
    ]);
    return {
      baseRef: base?.fullName,
      compareRef: compare?.fullName,
    };
  }

  private async selectRef(role: 'BASE' | 'COMPARE'): Promise<void> {
    if (!this.repository) {
      await this.selectRepository();
      return;
    }
    const picked = await this.dependencies.ui.pickRef(this.refs.map(refPickItem), role);
    if (!picked) {
      return;
    }
    this.baseRef = role === 'BASE' ? picked.fullName : this.baseRef;
    this.compareRef = role === 'COMPARE' ? picked.fullName : this.compareRef;
    const generation = this.invalidateOperation();
    if (!this.baseRef || !this.compareRef) {
      this.error = new UserFacingError(this.baseRef ? 'Select a compare branch' : 'Select a base branch');
      this.render();
      return;
    }
    const repository = this.repository;
    const selection = createSelection(repository, this.baseRef, this.compareRef);
    this.selection = selection;
    await this.dependencies.selectionStore.save(repository.id, selection);
    if (!this.isCurrent(generation, selection, repository)) {
      return;
    }
    await this.recompute(false);
  }

  private async recompute(reloadRefs: boolean): Promise<void> {
    const repository = this.repository;
    const selection = this.selection;
    if (!repository || !selection) {
      return;
    }
    const generation = this.startOperation();
    const source = this.activeSource;
    this.loading = true;
    this.error = undefined;
    this.render();
    await this.recomputeWithinOperation(generation, repository, selection, reloadRefs, source?.token);
  }

  private async recomputeWithinOperation(
    generation: number,
    repository: RepositorySnapshot,
    selection: ComparisonSelection,
    reloadRefs: boolean,
    token?: CancellationToken,
  ): Promise<void> {
    try {
      if (reloadRefs) {
        const refs = await this.dependencies.git.listRefs(repository.rootUri.fsPath, token);
        if (!this.isCurrent(generation, selection, repository)) {
          return;
        }
        this.refs = refs;
        if (!refs.some((ref) => ref.fullName === selection.baseRef)
          || !refs.some((ref) => ref.fullName === selection.compareRef)) {
          throw new UserFacingError('The selected branch no longer exists');
        }
      }
      await this.compareWithinOperation(generation, repository, selection, token);
    } catch (error) {
      this.applyComparisonError(generation, selection, repository, error);
    }
  }

  private async compareWithinOperation(
    generation: number,
    repository: RepositorySnapshot,
    selection: ComparisonSelection,
    token?: CancellationToken,
  ): Promise<void> {
    const result = await this.dependencies.comparisonService.compare(
      repository.rootUri.fsPath,
      selection,
      token,
    );
    if (!this.isCurrent(generation, selection, repository)) {
      return;
    }
    this.result = result;
    this.loading = false;
    this.error = result.files.length === 0
      ? new UserFacingError('No changes between the merge base and compare branch')
      : undefined;
    this.render();
  }

  private applyComparisonError(
    generation: number,
    selection: ComparisonSelection | undefined,
    repository: RepositorySnapshot,
    error: unknown,
  ): void {
    if (!this.isCurrent(generation, selection, repository) || isCancellation(error)) {
      return;
    }
    this.loading = false;
    this.error = toUserFacingError(error);
    this.logError(error);
    this.render();
  }

  private renderSelectionError(): void {
    this.error = new UserFacingError(this.baseRef ? 'Select a compare branch' : 'Select a base branch');
    this.render();
  }

  private render(): void {
    this.dependencies.tree.setInput({
      repositories: this.dependencies.repositories.repositories,
      repository: this.repository,
      refs: this.refs,
      baseRef: this.baseRef,
      compareRef: this.compareRef,
      selection: this.selection,
      result: this.result,
      comparisonGeneration: this.generation,
      loading: this.loading,
      error: this.error,
    });
  }

  private startOperation(): number {
    const generation = this.invalidateOperation();
    this.activeSource = this.dependencies.createCancellationTokenSource();
    return generation;
  }

  private invalidateOperation(): number {
    this.activeSource?.cancel();
    this.activeSource?.dispose();
    this.activeSource = undefined;
    return ++this.generation;
  }

  private isCurrent(
    generation: number,
    selection: ComparisonSelection | undefined,
    repository: RepositorySnapshot,
  ): boolean {
    return generation === this.generation
      && repository.id === this.repository?.id
      && (selection === undefined || sameSelection(selection, this.selection));
  }

  private logError(error: unknown): void {
    const detail = technicalErrorText(error);
    if (detail) {
      this.dependencies.output.appendLine(detail);
    }
  }
}

function repositoryPickItem(repository: RepositorySnapshot): RepositoryPickItem {
  const path = repository.rootUri.fsPath;
  return {
    label: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
    description: path,
    repository,
  };
}

function refPickItem(ref: GitRef): RefPickItem {
  return {
    label: ref.displayName,
    description: ref.kind === 'local' ? 'Local branch' : `Remote branch · ${ref.remote ?? ''}`.trim(),
    detail: ref.fullName,
    ref,
  };
}

function createSelection(
  repository: RepositorySnapshot,
  baseRef: string,
  compareRef: string,
): ComparisonSelection {
  return Object.freeze({
    repositoryUri: repository.rootUri.toString(true),
    baseRef,
    compareRef,
  });
}

function firstExistingRef(refs: readonly GitRef[], names: readonly string[]): GitRef | undefined {
  return names.map((name) => refs.find((ref) => ref.fullName === name)).find(Boolean);
}

function defaultRemote(remotes: readonly string[]): string | undefined {
  return remotes.includes('origin') ? 'origin' : [...remotes].sort()[0];
}

function selectedRemotes(
  repository: RepositorySnapshot,
  refs: readonly GitRef[],
  selection: ComparisonSelection,
): readonly string[] {
  const selected = [selection.baseRef, selection.compareRef]
    .map((name) => refs.find((ref) => ref.fullName === name))
    .filter((ref): ref is GitRef => ref !== undefined);
  const remoteNames = new Set(selected.flatMap((ref) => ref.kind === 'remote' && ref.remote ? [ref.remote] : []));
  if (remoteNames.size === 0) {
    const remote = defaultRemote(repository.remotes);
    if (remote) {
      remoteNames.add(remote);
    }
  }
  return [...remoteNames].sort();
}

function sameSelection(left: ComparisonSelection, right: ComparisonSelection | undefined): boolean {
  return right !== undefined
    && left.repositoryUri === right.repositoryUri
    && left.baseRef === right.baseRef
    && left.compareRef === right.compareRef;
}

function displayRef(ref: string | undefined, refs: readonly GitRef[]): string {
  if (!ref) {
    return '';
  }
  return refs.find((candidate) => candidate.fullName === ref)?.displayName
    ?? ref.replace(/^refs\/(?:heads|remotes)\//, '');
}

function isCancellation(error: unknown): boolean {
  return error instanceof GitCommandCancelledError;
}
