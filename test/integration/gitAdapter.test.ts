import { execFile } from 'node:child_process';
import { access, chmod, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GitCommandError } from '../../src/git/commandRunner';
import { DefaultGitAdapter } from '../../src/git/gitAdapter';
import { GitRepo } from '../helpers/gitRepo';

describe('DefaultGitAdapter', () => {
  let repo: GitRepo;
  let adapter: DefaultGitAdapter;
  let branchPoint: string;
  let mainCommit: string;
  let featureCommit: string;
  const blobContents = Buffer.from([0x00, 0xff, 0x41, 0x0a, 0xc3, 0xa9]);

  beforeEach(async () => {
    repo = await GitRepo.create();
    adapter = new DefaultGitAdapter();

    await repo.write('old name.txt', 'rename me\n');
    await repo.write('binary.dat', Buffer.from([0x01]));
    await repo.write('notes.txt', 'keep\nremove\n');
    branchPoint = await repo.commit('base');

    await repo.git(['switch', '-c', 'feature']);
    await rename(
      path.join(repo.root, 'old name.txt'),
      path.join(repo.root, 'renamed ü file.txt'),
    );
    await repo.write('binary.dat', blobContents);
    await repo.write('notes.txt', 'keep\nadded one\nadded two\n');
    featureCommit = await repo.commit('feature change');

    await repo.git(['switch', 'main']);
    await repo.write('main-only.txt', 'main change\n');
    mainCommit = await repo.commit('main change');

    await repo.git(['remote', 'add', 'origin', repo.root]);
    await repo.git(['fetch', 'origin']);
    await repo.git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
  });

  afterEach(async () => {
    await repo.dispose();
  });

  test('lists local and remote refs with their resolved commits', async () => {
    const refs = await adapter.listRefs(repo.root);

    expect(refs).toEqual(expect.arrayContaining([
      {
        fullName: 'refs/heads/main',
        displayName: 'main',
        kind: 'local',
        commit: mainCommit,
      },
      {
        fullName: 'refs/remotes/origin/feature',
        displayName: 'origin/feature',
        kind: 'remote',
        remote: 'origin',
        commit: featureCommit,
      },
    ]));
  });

  test('finds the configured remote HEAD and reports an absent one', async () => {
    await expect(adapter.findRemoteHead(repo.root, 'origin'))
      .resolves.toBe('refs/remotes/origin/main');
    await expect(adapter.findRemoteHead(repo.root, 'missing'))
      .resolves.toBeUndefined();
  });

  test('resolves commits and returns a typed command error for an unknown ref', async () => {
    await expect(adapter.resolveCommit(repo.root, 'refs/heads/feature'))
      .resolves.toBe(featureCommit);
    await expect(adapter.resolveCommit(repo.root, 'missing-ref'))
      .rejects.toMatchObject<Partial<GitCommandError>>({
        name: 'GitCommandError',
        exitCode: 128,
      });
  });

  test('finds a merge base and reports histories without a common ancestor', async () => {
    await expect(adapter.findMergeBase(repo.root, mainCommit, featureCommit))
      .resolves.toBe(branchPoint);

    await repo.git(['switch', '--orphan', 'unrelated']);
    await repo.write('unrelated.txt', 'separate history\n');
    const unrelatedCommit = await repo.commit('unrelated');

    await expect(adapter.findMergeBase(repo.root, mainCommit, unrelatedCommit))
      .resolves.toBeUndefined();
  });

  test('preserves rename paths and Unicode filenames', async () => {
    const files = await adapter.listChangedFiles(repo.root, branchPoint, featureCommit);

    expect(files).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'modified',
        newPath: 'notes.txt',
        lineChanges: { additions: 2, deletions: 1 },
      }),
      expect.objectContaining({
        newPath: 'binary.dat',
        lineChanges: { additions: null, deletions: null },
      }),
      expect.objectContaining({
        status: 'renamed',
        oldPath: 'old name.txt',
        newPath: 'renamed ü file.txt',
      }),
    ]));
  });

  test('lists every path from each commit tree without changing repository state', async () => {
    const before = await repo.snapshot();

    await expect(adapter.listTreePaths(repo.root, branchPoint).then((entries) => entries.map((entry) => typeof entry === 'string' ? entry : entry.path)))
      .resolves.toEqual(['binary.dat', 'notes.txt', 'old name.txt']);
    await expect(adapter.listTreePaths(repo.root, featureCommit).then((entries) => entries.map((entry) => typeof entry === 'string' ? entry : entry.path)))
      .resolves.toEqual(['binary.dat', 'notes.txt', 'renamed ü file.txt']);

    expect(await repo.snapshot()).toEqual(before);
  });

  test('reads blob contents as exact bytes', async () => {
    await expect(adapter.readBlob(repo.root, featureCommit, 'binary.dat'))
      .resolves.toEqual(blobContents);
    await expect(adapter.getBlobSize(repo.root, featureCommit, 'binary.dat'))
      .resolves.toBe(blobContents.byteLength);
  });

  test('does not change HEAD, index tree, or worktree status during read operations', async () => {
    const before = await repo.snapshot();

    await adapter.listRefs(repo.root);
    await adapter.resolveCommit(repo.root, 'refs/heads/feature');
    await adapter.findMergeBase(repo.root, mainCommit, featureCommit);
    await adapter.listChangedFiles(repo.root, branchPoint, featureCommit);
    await adapter.readBlob(repo.root, featureCommit, 'binary.dat');

    expect(await repo.snapshot()).toEqual(before);
  });

  test('fetches and prunes remote-tracking refs only when requested', async () => {
    await repo.git(['branch', 'fetch-source', featureCommit]);

    await adapter.fetch(repo.root, 'origin');

    await expect(repo.revParse('refs/remotes/origin/fetch-source'))
      .resolves.toBe(featureCommit);
  });

  test('ignores configured fetch refspecs and changes only the selected remote-tracking namespace', async () => {
    await repo.git(['config', '--unset-all', 'remote.origin.fetch']);
    await repo.git(['config', '--add', 'remote.origin.fetch', '+refs/heads/*:refs/heads/mirror/*']);
    await repo.git(['branch', 'fetch-source', featureCommit]);
    const localRefsBefore = await repo.git(['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads', 'refs/tags']);

    await adapter.fetch(repo.root, 'origin');

    expect(await repo.git(['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads', 'refs/tags']))
      .toEqual(localRefsBefore);
    await expect(repo.revParse('refs/remotes/origin/fetch-source')).resolves.toBe(featureCommit);
  });

  test('rejects a remote name that could be parsed as a Git option', async () => {
    await expect(adapter.fetch(repo.root, '--all')).rejects.toThrow('Invalid remote name');
  });

  test('disables configured tag following and tag pruning explicitly', async () => {
    const run = vi.fn(async () => Buffer.alloc(0));
    const isolatedAdapter = new DefaultGitAdapter({ run });

    await isolatedAdapter.fetch('/repo', 'origin');

    expect(run).toHaveBeenCalledWith('/repo', [
      'fetch',
      '--prune',
      '--no-tags',
      '--no-prune-tags',
      '--refmap=',
      '--',
      'origin',
      '+refs/heads/*:refs/remotes/origin/*',
    ], undefined);
  });

  test('does not invoke a promisor remote for missing objects during local reads', async () => {
    const source = await GitRepo.create();
    const cloneParent = await mkdtemp(path.join(tmpdir(), 'branch-compare-partial-'));
    const cloneRoot = path.join(cloneParent, 'clone');
    try {
      await source.write('large.txt', `${'base '.repeat(8_192)}\n`);
      const base = await source.commit('partial base');
      await source.write('large.txt', `${'feature '.repeat(8_192)}\n`);
      const feature = await source.commit('partial feature');
      await source.git(['config', 'uploadpack.allowFilter', 'true']);
      await git(cloneParent, [
        'clone', '--filter=blob:none', '--no-checkout', `file://${source.root}`, cloneRoot,
      ]);

      const sentinel = path.join(cloneParent, 'upload-pack-invoked');
      const uploadPack = path.join(cloneParent, 'upload-pack-sentinel.sh');
      await writeFile(uploadPack, `#!/bin/sh\ntouch "${sentinel}"\nexit 1\n`);
      await chmod(uploadPack, 0o755);
      await git(cloneRoot, ['config', 'remote.origin.uploadpack', uploadPack]);
      const partialAdapter = new DefaultGitAdapter();

      await expect(partialAdapter.listChangedFiles(cloneRoot, base, feature)).rejects.toBeDefined();
      await expect(partialAdapter.getBlobSize(cloneRoot, feature, 'large.txt')).rejects.toBeDefined();
      await expect(partialAdapter.readBlob(cloneRoot, feature, 'large.txt')).rejects.toBeDefined();
      await expect(access(sentinel)).rejects.toBeDefined();

      await expect(partialAdapter.fetch(cloneRoot, 'origin')).rejects.toBeDefined();
      await expect(access(sentinel)).resolves.toBeUndefined();
    } finally {
      await Promise.all([source.dispose(), rm(cloneParent, { recursive: true, force: true })]);
    }
  });

  test('uses committed attributes and never executes configured diff helpers', async () => {
    const hermeticRepo = await GitRepo.create();
    try {
      await hermeticRepo.write('.gitattributes', '*.special binary\n*.txt diff=sentinel\n');
      await hermeticRepo.write('data.special', 'base\n');
      await hermeticRepo.write('notes.txt', 'base\n');
      const base = await hermeticRepo.commit('hermetic base');
      await hermeticRepo.git(['switch', '-c', 'feature/hermetic']);
      await hermeticRepo.write('data.special', 'feature\n');
      await hermeticRepo.write('notes.txt', 'feature\n');
      const feature = await hermeticRepo.commit('hermetic feature');

      const textconvSentinel = path.join(hermeticRepo.root, 'textconv-invoked');
      const externalSentinel = path.join(hermeticRepo.root, 'external-diff-invoked');
      const textconv = path.join(hermeticRepo.root, 'textconv.sh');
      const externalDiff = path.join(hermeticRepo.root, 'external-diff.sh');
      await writeFile(textconv, `#!/bin/sh\ntouch "${textconvSentinel}"\ncat "$1"\n`);
      await writeFile(externalDiff, `#!/bin/sh\ntouch "${externalSentinel}"\nexit 0\n`);
      await Promise.all([chmod(textconv, 0o755), chmod(externalDiff, 0o755)]);
      await hermeticRepo.git(['config', 'diff.sentinel.textconv', textconv]);
      await hermeticRepo.git(['config', 'diff.external', externalDiff]);
      await hermeticRepo.write('.gitattributes', '*.special text\n*.txt diff=sentinel\n');

      const files = await new DefaultGitAdapter().listChangedFiles(hermeticRepo.root, base, feature);

      expect(files).toEqual(expect.arrayContaining([
        expect.objectContaining({
          newPath: 'data.special',
          lineChanges: { additions: null, deletions: null },
        }),
        expect.objectContaining({
          newPath: 'notes.txt',
          lineChanges: { additions: 1, deletions: 1 },
        }),
      ]));
      await expect(access(textconvSentinel)).rejects.toBeDefined();
      await expect(access(externalSentinel)).rejects.toBeDefined();
    } finally {
      await hermeticRepo.dispose();
    }
  });
});

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<Buffer> {
  const result = await execFileAsync('git', [...args], { cwd, encoding: 'buffer' });
  return result.stdout as Buffer;
}
