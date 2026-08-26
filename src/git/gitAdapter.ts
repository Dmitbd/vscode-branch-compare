import type { CancellationToken } from 'vscode';
import type { ChangedFile, GitRef } from '../domain/model';
import { GitOutputError } from './GitOutputError';
import { GitCommandError, GitCommandRunner, type CommandRunner } from './commandRunner';
import { parseNameStatus } from './parseNameStatus';
import { parseNumStat } from './parseNumStat';
import { parsePathList } from './parsePathList';
import { parseRefs } from './parseRefs';

const shaPattern = /^[0-9a-f]{40,64}$/;

export interface GitAdapter {
  listRefs(root: string, token?: CancellationToken): Promise<readonly GitRef[]>;
  findRemoteHead(root: string, remote: string, token?: CancellationToken): Promise<string | undefined>;
  resolveCommit(root: string, ref: string, token?: CancellationToken): Promise<string>;
  findMergeBase(
    root: string,
    baseSha: string,
    compareSha: string,
    token?: CancellationToken,
  ): Promise<string | undefined>;
  listChangedFiles(
    root: string,
    fromSha: string,
    toSha: string,
    token?: CancellationToken,
  ): Promise<readonly ChangedFile[]>;
  listTreePaths(root: string, commit: string, token?: CancellationToken): Promise<readonly string[]>;
  readBlob(root: string, commit: string, path: string, token?: CancellationToken): Promise<Buffer>;
  getBlobSize(root: string, commit: string, path: string, token?: CancellationToken): Promise<number>;
  fetch(root: string, remote: string, token?: CancellationToken): Promise<void>;
}

export class DefaultGitAdapter implements GitAdapter {
  public constructor(private readonly runner: CommandRunner = new GitCommandRunner()) {}

  public async listRefs(root: string, token?: CancellationToken): Promise<readonly GitRef[]> {
    const output = await this.runner.run(root, [
      'for-each-ref',
      '--format=%(refname)%00%(objectname)%00%(symref)',
      'refs/heads',
      'refs/remotes',
    ], token);
    const refs = parseRefs(output);
    for (const ref of refs) {
      validateSha(ref.commit);
    }
    return refs;
  }

  public async findRemoteHead(
    root: string,
    remote: string,
    token?: CancellationToken,
  ): Promise<string | undefined> {
    try {
      const output = await this.runner.run(
        root,
        ['symbolic-ref', '--quiet', `refs/remotes/${remote}/HEAD`],
        token,
      );
      const target = output.toString('utf8').trim();
      const remotePrefix = `refs/remotes/${remote}/`;
      if (!target.startsWith(remotePrefix) || target.length === remotePrefix.length) {
        throw new GitOutputError('Invalid remote HEAD output.');
      }
      return target;
    } catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 1) {
        return undefined;
      }
      throw error;
    }
  }

  public async resolveCommit(root: string, ref: string, token?: CancellationToken): Promise<string> {
    const output = await this.runner.run(root, ['rev-parse', '--verify', `${ref}^{commit}`], token);
    return parseSha(output);
  }

  public async findMergeBase(
    root: string,
    baseSha: string,
    compareSha: string,
    token?: CancellationToken,
  ): Promise<string | undefined> {
    try {
      const output = await this.runner.run(
        root,
        ['merge-base', '--', baseSha, compareSha],
        token,
      );
      return parseSha(output);
    } catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 1) {
        return undefined;
      }
      throw error;
    }
  }

  public async listChangedFiles(
    root: string,
    fromSha: string,
    toSha: string,
    token?: CancellationToken,
  ): Promise<readonly ChangedFile[]> {
    const [statusOutput, numStatOutput] = await Promise.all([
      this.runner.run(root, [
        'diff',
        '--name-status',
        '-z',
        '--find-renames',
        fromSha,
        toSha,
        '--',
      ], token),
      this.runner.run(root, [
        'diff',
        '--numstat',
        '-z',
        '--find-renames',
        fromSha,
        toSha,
        '--',
      ], token),
    ]);
    const stats = parseNumStat(numStatOutput);
    return parseNameStatus(statusOutput).map((file) => {
      const stat = stats.find((candidate) => file.status === 'renamed'
        ? candidate.oldPath === file.oldPath && candidate.newPath === file.newPath
        : candidate.newPath === (file.newPath ?? file.oldPath));
      if (!stat) throw new GitOutputError('Missing numstat record for changed file.');
      return { ...file, lineChanges: Object.freeze({ ...stat.lineChanges }) };
    });
  }

  public async listTreePaths(
    root: string,
    commit: string,
    token?: CancellationToken,
  ): Promise<readonly string[]> {
    validateSha(commit);
    return parsePathList(await this.runner.run(
      root,
      ['ls-tree', '-r', '--name-only', '-z', commit, '--'],
      token,
    ));
  }

  public readBlob(
    root: string,
    commit: string,
    path: string,
    token?: CancellationToken,
  ): Promise<Buffer> {
    return this.runner.run(root, ['show', `${commit}:${path}`], token);
  }

  public async getBlobSize(
    root: string,
    commit: string,
    path: string,
    token?: CancellationToken,
  ): Promise<number> {
    const output = await this.runner.run(root, ['cat-file', '-s', `${commit}:${path}`], token);
    const value = output.toString('utf8').trim();
    if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
      throw new GitOutputError('Invalid blob size output.');
    }
    const size = Number(value);
    if (!Number.isSafeInteger(size)) {
      throw new GitOutputError('Blob size exceeds the supported numeric range.');
    }
    return size;
  }

  public async fetch(root: string, remote: string, token?: CancellationToken): Promise<void> {
    validateRemoteName(remote);
    await this.runner.run(root, [
      'fetch',
      '--prune',
      '--no-tags',
      '--no-prune-tags',
      '--refmap=',
      '--',
      remote,
      `+refs/heads/*:refs/remotes/${remote}/*`,
    ], token);
  }
}

function parseSha(output: Buffer): string {
  const sha = output.toString('utf8').trim();
  validateSha(sha);
  return sha;
}

function validateSha(sha: string): void {
  if (!shaPattern.test(sha)) {
    throw new GitOutputError('Invalid SHA output.');
  }
}

function validateRemoteName(remote: string): void {
  const components = remote.split('/');
  if (
    remote.length === 0
    || remote.startsWith('-')
    || remote.includes('..')
    || remote.includes('@{')
    || /[\u0000-\u0020\u007F~^:?*[\\]/u.test(remote)
    || components.some((component) => (
      component.length === 0
      || component.startsWith('.')
      || component.endsWith('.')
      || component.endsWith('.lock')
    ))
  ) {
    throw new GitOutputError('Invalid remote name.');
  }
}
