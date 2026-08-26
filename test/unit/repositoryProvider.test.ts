import { createHash } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';

vi.mock('vscode', () => ({ extensions: { getExtension: () => undefined } }));

import {
  GitIntegrationUnavailableError,
  RepositoryProvider,
  shouldShowRepositorySelector,
  type BuiltInGitApi,
  type BuiltInRepository,
  type GitExtensionLookup,
} from '../../src/repositories/repositoryProvider';

interface FakeUri {
  readonly value: string;
  toString(skipEncoding?: boolean): string;
}

function uri(value: string): FakeUri {
  return {
    value,
    toString: (skipEncoding = false) => (skipEncoding ? value : encodeURI(value)),
  };
}

function repository(root: string, branch?: string, remotes: readonly string[] = []): BuiltInRepository {
  return {
    rootUri: uri(root) as never,
    state: {
      HEAD: branch ? { name: branch } : undefined,
      remotes: remotes.map((name) => ({ name })),
    },
  };
}

function event<T>() {
  const listeners = new Set<(value: T) => unknown>();
  return {
    fire(value: T): void {
      for (const listener of listeners) {
        listener(value);
      }
    },
    subscribe(listener: (value: T) => unknown) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  };
}

function gitApi(repositories: readonly BuiltInRepository[]): {
  api: BuiltInGitApi;
  opened: ReturnType<typeof event<BuiltInRepository>>;
  closed: ReturnType<typeof event<BuiltInRepository>>;
} {
  const opened = event<BuiltInRepository>();
  const closed = event<BuiltInRepository>();
  return {
    api: {
      repositories,
      onDidOpenRepository: (listener) => opened.subscribe(listener),
      onDidCloseRepository: (listener) => closed.subscribe(listener),
    },
    opened,
    closed,
  };
}

describe('RepositoryProvider', () => {
  test('creates sorted, path-free repository snapshots and maps open/close events', () => {
    const zeta = repository('file:///workspace/zeta', 'feature/zeta', ['upstream', 'origin']);
    const alpha = repository('file:///workspace/alpha', undefined, ['origin']);
    const git = gitApi([zeta, alpha]);
    const provider = new RepositoryProvider(git.api);
    const opened: string[] = [];
    const closed: string[] = [];
    provider.onDidOpenRepository((snapshot) => opened.push(snapshot.id));
    provider.onDidCloseRepository((snapshot) => closed.push(snapshot.id));

    expect(provider.repositories).toEqual([
      {
        id: stableId('file:///workspace/alpha'),
        rootUri: alpha.rootUri,
        currentBranch: undefined,
        remotes: ['origin'],
      },
      {
        id: stableId('file:///workspace/zeta'),
        rootUri: zeta.rootUri,
        currentBranch: 'feature/zeta',
        remotes: ['origin', 'upstream'],
      },
    ]);
    expect(provider.repositories.map((snapshot) => snapshot.id).join(' ')).not.toContain('/workspace/');

    git.opened.fire(alpha);
    git.closed.fire(zeta);

    expect(opened).toEqual([stableId('file:///workspace/alpha')]);
    expect(closed).toEqual([stableId('file:///workspace/zeta')]);
  });

  test.each([
    [0, false],
    [1, false],
    [2, true],
  ])('shows the repository selector for %i repositories: %s', (count, expected) => {
    expect(shouldShowRepositorySelector(count)).toBe(expected);
  });

  test('activates the built-in Git extension before retrieving API version 1', async () => {
    const git = gitApi([]);
    const activate = vi.fn(async () => undefined);
    const getAPI = (version: number) => {
      expect(version).toBe(1);
      return git.api;
    };
    const extensions: GitExtensionLookup = {
      getExtension: () => ({ isActive: false, activate, exports: { getAPI } }),
    };

    const provider = await RepositoryProvider.create(extensions);

    expect(provider.repositories).toEqual([]);
    expect(activate).toHaveBeenCalledOnce();
  });

  test('rejects when the built-in Git extension is unavailable or disabled', async () => {
    await expect(RepositoryProvider.create({ getExtension: () => undefined }))
      .rejects.toBeInstanceOf(GitIntegrationUnavailableError);
    await expect(RepositoryProvider.create({
      getExtension: () => ({ isActive: false, activate: async () => { throw new Error('disabled'); }, exports: {} }),
    })).rejects.toBeInstanceOf(GitIntegrationUnavailableError);
  });
});

function stableId(rootUri: string): string {
  return createHash('sha256').update(rootUri.normalize('NFC')).digest('hex').slice(0, 16);
}
