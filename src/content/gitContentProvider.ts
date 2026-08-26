import * as vscode from 'vscode';
import type { ChangedFile, ComparisonResult, DiffTarget } from '../domain/model';
import type { GitAdapter } from '../git/gitAdapter';
import type { RepositorySnapshot } from '../repositories/repositoryProvider';
import { createVirtualUri, parseVirtualUri, type VirtualDocumentRef } from './virtualUri';

const maxBlobBytes = 10 * 1024 * 1024;
const maxCachedBlobs = 32;

export interface RepositoryRegistry {
  readonly repositories: readonly RepositorySnapshot[];
}

export class UnknownRepositoryError extends Error {
  public constructor(repositoryId: string) {
    super(`Unknown repository id: ${repositoryId}`);
    this.name = 'UnknownRepositoryError';
  }
}

export class BinaryBlobError extends Error {
  public constructor(public readonly path: string) {
    super(`The Git blob for ${path} contains binary data.`);
    this.name = 'BinaryBlobError';
  }
}

export class BlobTooLargeError extends Error {
  public constructor(public readonly byteLength: number) {
    super(`The Git blob is ${byteLength} bytes, exceeding the 10 MiB text preview limit.`);
    this.name = 'BlobTooLargeError';
  }
}

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  private readonly cache = new Map<string, string>();

  public constructor(
    private readonly git: Pick<GitAdapter, 'readBlob' | 'getBlobSize'>,
    private readonly repositoryRegistry: RepositoryRegistry,
  ) {}

  public async provideTextDocumentContent(
    uri: vscode.Uri,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    const ref = parseVirtualUri(uri);
    if (ref.empty) {
      return '';
    }

    const cacheKey = createCacheKey(ref);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }

    const repository = this.repositoryRegistry.repositories.find((candidate) => candidate.id === ref.repositoryId);
    if (!repository) {
      throw new UnknownRepositoryError(ref.repositoryId);
    }

    const byteLength = await this.git.getBlobSize(repository.rootUri.fsPath, ref.commit, ref.path, token);
    if (byteLength > maxBlobBytes) {
      throw new BlobTooLargeError(byteLength);
    }

    const blob = await this.git.readBlob(repository.rootUri.fsPath, ref.commit, ref.path, token);
    if (blob.byteLength > maxBlobBytes) {
      throw new BlobTooLargeError(blob.byteLength);
    }
    if (blob.includes(0)) {
      throw new BinaryBlobError(ref.path);
    }

    const text = blob.toString('utf8');
    this.cache.set(cacheKey, text);
    if (this.cache.size > maxCachedBlobs) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    return text;
  }
}

export async function openFullDiff(
  repositoryId: string,
  result: ComparisonResult,
  target: DiffTarget,
  baseLabel: string,
  compareLabel: string,
): Promise<void> {
  const { left, right, displayPath } = createDiffRefs(repositoryId, result, target);
  await vscode.commands.executeCommand(
    'vscode.diff',
    createVirtualUri(left),
    createVirtualUri(right),
    `${baseLabel} ↔ ${compareLabel} · ${displayPath}`,
    { preview: true },
  );
}

function createDiffRefs(
  repositoryId: string,
  result: ComparisonResult,
  target: DiffTarget,
): { left: VirtualDocumentRef; right: VirtualDocumentRef; displayPath: string } {
  if (target.kind === 'unchanged') {
    return {
      left: documentRef(repositoryId, result.mergeBaseSha, target.path, false),
      right: documentRef(repositoryId, result.compareSha, target.path, false),
      displayPath: target.path,
    };
  }

  return createChangedDiffRefs(repositoryId, result, target.file);
}

function createChangedDiffRefs(
  repositoryId: string,
  result: ComparisonResult,
  file: ChangedFile,
): { left: VirtualDocumentRef; right: VirtualDocumentRef; displayPath: string } {
  switch (file.status) {
    case 'modified': {
      const oldPath = requiredPath(file.oldPath, 'modified file old path');
      const newPath = requiredPath(file.newPath, 'modified file new path');
      return {
        left: documentRef(repositoryId, result.mergeBaseSha, oldPath, false),
        right: documentRef(repositoryId, result.compareSha, newPath, false),
        displayPath: newPath,
      };
    }
    case 'added': {
      const newPath = requiredPath(file.newPath, 'added file new path');
      return {
        left: documentRef(repositoryId, result.mergeBaseSha, newPath, true),
        right: documentRef(repositoryId, result.compareSha, newPath, false),
        displayPath: newPath,
      };
    }
    case 'deleted': {
      const oldPath = requiredPath(file.oldPath, 'deleted file old path');
      return {
        left: documentRef(repositoryId, result.mergeBaseSha, oldPath, false),
        right: documentRef(repositoryId, result.compareSha, oldPath, true),
        displayPath: oldPath,
      };
    }
    case 'renamed': {
      const oldPath = requiredPath(file.oldPath, 'renamed file old path');
      const newPath = requiredPath(file.newPath, 'renamed file new path');
      return {
        left: documentRef(repositoryId, result.mergeBaseSha, oldPath, false),
        right: documentRef(repositoryId, result.compareSha, newPath, false),
        displayPath: newPath,
      };
    }
  }
}

function documentRef(
  repositoryId: string,
  commit: string,
  path: string,
  empty: boolean,
): VirtualDocumentRef {
  return { repositoryId, commit, path, empty };
}

function requiredPath(path: string | undefined, description: string): string {
  if (!path) {
    throw new Error(`Missing ${description}.`);
  }
  return path;
}

function createCacheKey(ref: VirtualDocumentRef): string {
  return `${ref.repositoryId}\0${ref.commit}\0${ref.path}`;
}
