import type { CancellationToken } from 'vscode';
import type { ChangedFile, ComparisonResult, ComparisonSelection } from '../domain/model';
import { GitCommandCancelledError, GitCommandError } from '../git/commandRunner';
import type { GitAdapter } from '../git/gitAdapter';
import { ComparisonCache, type ComparisonData } from './comparisonCache';

const displayPathCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export class MissingRefError extends Error {
  public constructor(public readonly ref: string, options?: ErrorOptions) {
    super(`Git ref is no longer available: ${ref}`, options);
    this.name = 'MissingRefError';
  }
}

export class NoCommonAncestorError extends Error {
  public constructor(
    public readonly baseSha: string,
    public readonly compareSha: string,
  ) {
    super('The selected commits do not have a common ancestor.');
    this.name = 'NoCommonAncestorError';
  }
}

export class IdenticalSelectionError extends Error {
  public constructor() {
    super('Base and compare resolve to the same commit.');
    this.name = 'IdenticalSelectionError';
  }
}

export class ComparisonService {
  public constructor(
    private readonly adapter: GitAdapter,
    private readonly cache = new ComparisonCache(),
  ) {}

  public async compare(
    root: string,
    selection: ComparisonSelection,
    token?: CancellationToken,
  ): Promise<ComparisonResult> {
    throwIfCancelled(token);
    if (selection.baseRef === selection.compareRef) {
      throw new IdenticalSelectionError();
    }

    const selectionSnapshot = Object.freeze({ ...selection });
    const baseSha = await this.resolveRef(root, selectionSnapshot.baseRef, token);
    throwIfCancelled(token);
    const compareSha = await this.resolveRef(root, selectionSnapshot.compareRef, token);
    throwIfCancelled(token);

    if (baseSha === compareSha) {
      throw new IdenticalSelectionError();
    }

    let data = this.cache.get(selectionSnapshot.repositoryUri, baseSha, compareSha);
    if (!data) {
      data = await this.computeComparisonData(root, baseSha, compareSha, token);
      this.cache.set(selectionSnapshot.repositoryUri, baseSha, compareSha, data);
    }

    return createComparisonResult(selectionSnapshot, data);
  }

  private async resolveRef(
    root: string,
    ref: string,
    token?: CancellationToken,
  ): Promise<string> {
    try {
      return await this.adapter.resolveCommit(root, ref, token);
    } catch (error) {
      if (
        error instanceof GitCommandCancelledError
        || token?.isCancellationRequested
        || !(error instanceof GitCommandError)
        || error.exitCode !== 128
      ) {
        throw error;
      }
      throw new MissingRefError(ref, { cause: error });
    }
  }

  private async computeComparisonData(
    root: string,
    baseSha: string,
    compareSha: string,
    token?: CancellationToken,
  ): Promise<ComparisonData> {
    const mergeBaseSha = await this.adapter.findMergeBase(root, baseSha, compareSha, token);
    throwIfCancelled(token);
    if (!mergeBaseSha) {
      throw new NoCommonAncestorError(baseSha, compareSha);
    }

    const changedFiles = await this.adapter.listChangedFiles(root, mergeBaseSha, compareSha, token);
    throwIfCancelled(token);
    const files = Object.freeze(
      changedFiles
        .map((file) => Object.freeze({ ...file }))
        .sort(compareChangedFiles),
    );

    return Object.freeze({
      baseSha,
      compareSha,
      mergeBaseSha,
      files,
    });
  }
}

function createComparisonResult(
  selection: ComparisonSelection,
  data: ComparisonData,
): ComparisonResult {
  return Object.freeze({ selection, ...data });
}

function throwIfCancelled(token?: CancellationToken): void {
  if (token?.isCancellationRequested) {
    throw new GitCommandCancelledError();
  }
}

function compareChangedFiles(left: ChangedFile, right: ChangedFile): number {
  const leftPath = normalizedDisplayPath(left);
  const rightPath = normalizedDisplayPath(right);
  const displayOrder = displayPathCollator.compare(leftPath, rightPath);
  if (displayOrder !== 0) {
    return displayOrder;
  }
  return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
}

function normalizedDisplayPath(file: ChangedFile): string {
  const displayPath = file.newPath ?? file.oldPath;
  if (displayPath === undefined) {
    throw new TypeError('Changed file must have an old or new path.');
  }
  return displayPath.normalize('NFC');
}
