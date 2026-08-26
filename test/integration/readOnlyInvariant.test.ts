import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn(async () => undefined) },
  Uri: class Uri {},
}));

import type { CancellationToken } from 'vscode';
import { ComparisonService } from '../../src/compare/comparisonService';
import {
  CompareController,
  type ControllerCancellationTokenSource,
  type ControllerDependencies,
} from '../../src/controller/compareController';
import type { ComparisonSelection, DiffTarget } from '../../src/domain/model';
import { DefaultGitAdapter } from '../../src/git/gitAdapter';
import { GitCommandRunner } from '../../src/git/commandRunner';
import type { RepositorySnapshot } from '../../src/repositories/repositoryProvider';
import type { TreeModelInput } from '../../src/tree/treeModel';
import { GitRepo } from '../helpers/gitRepo';

const repositories: GitRepo[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.dispose()));
});

describe('read-only workflow invariants', () => {
  test('select, compare, refresh, and diff preparation preserve HEAD, index, and worktree', async () => {
    const repo = await createFeatureRepository();
    const commandRunner = new GitCommandRunner();
    const gitCommands: string[][] = [];
    const adapter = new DefaultGitAdapter({
      async run(cwd, args, token) {
        gitCommands.push([...args]);
        return commandRunner.run(cwd, args, token);
      },
    });
    const snapshot = await repositorySnapshot(repo, []);
    let selectedDiff: DiffTarget | undefined;
    let comparisonGeneration = 0;
    const controller = controllerFor(snapshot, adapter, async (_id, result, target) => {
      selectedDiff = target;
      if (target.kind === 'unchanged') {
        await adapter.readBlob(repo.root, result.mergeBaseSha, target.path);
        await adapter.readBlob(repo.root, result.compareSha, target.path);
      } else {
        const path = target.file.newPath ?? target.file.oldPath;
        if (path && target.file.status !== 'deleted') {
          await adapter.readBlob(repo.root, result.compareSha, path);
        }
      }
    }, (input) => { comparisonGeneration = input.comparisonGeneration ?? 0; });
    const before = await invariantSnapshot(repo);

    await controller.initialize();
    expect(await invariantSnapshot(repo)).toEqual(before);

    await controller.selectBase();
    expect(await invariantSnapshot(repo)).toEqual(before);

    await controller.refresh();
    expect(await invariantSnapshot(repo)).toEqual(before);

    await controller.toggleUnchanged();
    expect(await invariantSnapshot(repo)).toEqual(before);
    expect(gitCommands.filter((args) => args.includes('ls-tree'))).toHaveLength(2);
    expect(gitCommands.every((args) => args[0] === '--no-lazy-fetch')).toBe(true);
    expect(gitCommands.some((args) => args.includes('fetch'))).toBe(false);
    expect(gitCommands.some((args) => args.includes('checkout') || args.includes('switch'))).toBe(false);

    await adapter.listChangedFiles(
      repo.root,
      await repo.revParse('refs/heads/main'),
      await repo.revParse('refs/heads/feature/x'),
    );
    expect(await invariantSnapshot(repo)).toEqual(before);

    const unchangedTarget: DiffTarget = { kind: 'unchanged', path: 'base.txt' };
    await controller.openDiff(unchangedTarget, comparisonGeneration);
    expect(selectedDiff).toEqual(unchangedTarget);
    expect(await invariantSnapshot(repo)).toEqual(before);
  });

  test('fetch may update remote-tracking refs but preserves HEAD, branch, index, and worktree', async () => {
    const repo = await createFeatureRepository(true);
    const adapter = new DefaultGitAdapter();
    const snapshot = await repositorySnapshot(repo, ['origin']);
    const controller = controllerFor(snapshot, adapter);
    await controller.initialize();
    const before = await invariantSnapshot(repo);
    const branchBefore = await repo.revParse('refs/heads/feature/x');

    await controller.fetch();

    expect(await invariantSnapshot(repo)).toEqual(before);
    expect(await repo.revParse('refs/heads/feature/x')).toBe(branchBefore);
  });
});

async function createFeatureRepository(withRemote = false): Promise<GitRepo> {
  const repo = await GitRepo.create();
  repositories.push(repo);
  await repo.write('base.txt', 'base\n');
  await repo.commit('base');
  if (withRemote) {
    await repo.git(['init', '--bare', 'remote.git']);
    await repo.git(['remote', 'add', 'origin', `${repo.root}/remote.git`]);
    await repo.git(['push', '-u', 'origin', 'main']);
    await repo.git(['remote', 'set-head', 'origin', 'main']);
  }
  await repo.git(['switch', '-c', 'feature/x']);
  await repo.write('feature.txt', 'feature\n');
  await repo.commit('feature');
  return repo;
}

async function repositorySnapshot(repo: GitRepo, remotes: readonly string[]): Promise<RepositorySnapshot> {
  return {
    id: 'fixture-repository',
    rootUri: {
      fsPath: repo.root,
      toString: () => `file://${repo.root}`,
    },
    currentBranch: 'feature/x',
    remotes,
  } as unknown as RepositorySnapshot;
}

function controllerFor(
  repository: RepositorySnapshot,
  adapter: DefaultGitAdapter,
  openDiff?: NonNullable<ControllerDependencies['openDiff']>,
  onTreeInput?: (input: TreeModelInput) => void,
): CompareController {
  const dependencies: ControllerDependencies = {
    repositories: { repositories: [repository] },
    git: adapter,
    comparisonService: new ComparisonService(adapter),
    selectionStore: {
      load: async () => undefined,
      save: async () => undefined,
    },
    tree: { setInput: (input) => onTreeInput?.(input) },
    ui: {
      pickRepository: async () => repository,
      pickRef: async (items) => items.find((item) => item.ref.fullName === 'refs/heads/main')?.ref,
      withProgress: async (_title, task) => task(),
      showError: async () => undefined,
    },
    output: { appendLine: () => undefined, show: () => undefined },
    createCancellationTokenSource: cancellationSource,
    openDiff,
  };
  return new CompareController(dependencies);
}

async function invariantSnapshot(repo: GitRepo): Promise<{
  head: string;
  index: string;
  status: string;
}> {
  // `write-tree` and `status` may both briefly lock the index, so the snapshot
  // is intentionally sequential even though every command is read-only.
  const head = await repo.git(['rev-parse', 'HEAD']);
  const index = await repo.git(['write-tree']);
  const status = await repo.git(['status', '--porcelain=v2', '-z']);
  return {
    head: head.toString('hex'),
    index: index.toString('hex'),
    status: status.toString('hex'),
  };
}

function cancellationSource(): ControllerCancellationTokenSource {
  let cancelled = false;
  const token = {
    get isCancellationRequested() { return cancelled; },
    onCancellationRequested: () => ({ dispose() {} }),
  } as CancellationToken;
  return {
    token,
    cancel() { cancelled = true; },
    dispose() {},
  };
}
