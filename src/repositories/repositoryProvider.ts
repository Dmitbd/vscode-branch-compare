import { createHash } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';

export interface BuiltInRepository {
  readonly rootUri: vscode.Uri;
  readonly state: {
    readonly HEAD: { readonly name?: string } | undefined;
    readonly remotes: readonly { readonly name: string }[];
  };
}

export interface BuiltInGitApi {
  readonly repositories: readonly BuiltInRepository[];
  readonly onDidOpenRepository: vscode.Event<BuiltInRepository>;
  readonly onDidCloseRepository: vscode.Event<BuiltInRepository>;
}

interface BuiltInGitExtension {
  readonly isActive: boolean;
  readonly exports: { readonly getAPI?: (version: number) => BuiltInGitApi };
  activate(): Thenable<unknown>;
}

export interface GitExtensionLookup {
  getExtension(extensionId: string): BuiltInGitExtension | undefined;
}

export interface RepositorySnapshot {
  readonly id: string;
  readonly label: string;
  readonly rootUri: vscode.Uri;
  readonly currentBranch: string | undefined;
  readonly remotes: readonly string[];
}

export class GitIntegrationUnavailableError extends Error {
  public constructor(options?: ErrorOptions) {
    super('The built-in VS Code Git integration is unavailable.', options);
    this.name = 'GitIntegrationUnavailableError';
  }
}

export class RepositoryProvider {
  public constructor(private readonly gitApi: BuiltInGitApi) {}

  public static async create(extensions?: GitExtensionLookup): Promise<RepositoryProvider> {
    const lookup = extensions ?? await loadExtensionLookup();
    const gitExtension = lookup.getExtension('vscode.git');
    if (!gitExtension) {
      throw new GitIntegrationUnavailableError();
    }

    try {
      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }
      const gitApi = gitExtension.exports.getAPI?.(1);
      if (!gitApi) {
        throw new Error('The Git extension did not expose API version 1.');
      }
      return new RepositoryProvider(gitApi);
    } catch (error) {
      throw new GitIntegrationUnavailableError({ cause: error });
    }
  }

  public get repositories(): readonly RepositorySnapshot[] {
    return Object.freeze(
      this.gitApi.repositories
        .map(createSnapshot)
        .sort(compareSnapshots),
    );
  }

  public readonly onDidOpenRepository: vscode.Event<RepositorySnapshot> = (listener, thisArgs, disposables) => (
    this.gitApi.onDidOpenRepository((repository) => listener.call(thisArgs, createSnapshot(repository)), undefined, disposables)
  );

  public readonly onDidCloseRepository: vscode.Event<RepositorySnapshot> = (listener, thisArgs, disposables) => (
    this.gitApi.onDidCloseRepository((repository) => listener.call(thisArgs, createSnapshot(repository)), undefined, disposables)
  );
}

export function shouldShowRepositorySelector(repositoryCount: number): boolean {
  return repositoryCount > 1;
}

function createSnapshot(repository: BuiltInRepository): RepositorySnapshot {
  const rootUri = normalizeRootUri(repository.rootUri);
  const remotes = Object.freeze(
    [...repository.state.remotes]
      .map((remote) => remote.name)
      .sort(compareStrings),
  );
  return Object.freeze({
    id: createRepositoryId(rootUri),
    label: path.basename(repository.rootUri.fsPath) || repository.rootUri.fsPath,
    rootUri: repository.rootUri,
    currentBranch: repository.state.HEAD?.name,
    remotes,
  });
}

function normalizeRootUri(rootUri: vscode.Uri): string {
  return rootUri.toString(true).normalize('NFC');
}

function createRepositoryId(rootUri: string): string {
  return createHash('sha256').update(rootUri).digest('hex').slice(0, 16);
}

function compareSnapshots(left: RepositorySnapshot, right: RepositorySnapshot): number {
  return compareStrings(normalizeRootUri(left.rootUri), normalizeRootUri(right.rootUri));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function loadExtensionLookup(): Promise<GitExtensionLookup> {
  return vscode.extensions as unknown as GitExtensionLookup;
}
