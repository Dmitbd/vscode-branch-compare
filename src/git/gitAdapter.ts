import type { CancellationToken } from 'vscode';
import type { ChangedFile, GitRef, TreePath } from '../domain/model';
import { GitOutputError } from './GitOutputError';
import { GitCommandError, GitCommandRunner, type CommandRunner } from './commandRunner';
import { parseNameStatus } from './parseNameStatus';
import { parseNumStat, type NumStatRecord } from './parseNumStat';
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
  listTreePaths(root: string, commit: string, token?: CancellationToken): Promise<readonly TreePath[]>;
  readBlob(root: string, commit: string, path: string, token?: CancellationToken): Promise<Buffer>;
  getBlobSize(root: string, commit: string, path: string, token?: CancellationToken): Promise<number>;
  readBlobObject(root: string, objectId: string, token?: CancellationToken): Promise<Buffer>;
  getBlobObjectSize(root: string, objectId: string, token?: CancellationToken): Promise<number>;
  fetch(root: string, remote: string, token?: CancellationToken): Promise<void>;
}

export class DefaultGitAdapter implements GitAdapter {
  public constructor(private readonly runner: CommandRunner = new GitCommandRunner()) {}

  public async listRefs(root: string, token?: CancellationToken): Promise<readonly GitRef[]> {
    const output = await this.runLocal(root, [
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
      const output = await this.runLocal(
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
    const output = await this.runLocal(root, ['rev-parse', '--verify', `${ref}^{commit}`], token);
    return parseSha(output);
  }

  public async findMergeBase(
    root: string,
    baseSha: string,
    compareSha: string,
    token?: CancellationToken,
  ): Promise<string | undefined> {
    try {
      const output = await this.runLocal(
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
    validateSha(fromSha);
    validateSha(toSha);
    const [statusOutput, numStatOutput] = await Promise.all([
      this.runLocal(root, [
        `--attr-source=${fromSha}`,
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--raw',
        '--abbrev=64',
        '-z',
        '--find-renames',
        fromSha,
        toSha,
        '--',
      ], token),
      this.runLocal(root, [
        `--attr-source=${fromSha}`,
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--numstat',
        '-z',
        '--find-renames',
        fromSha,
        toSha,
        '--',
      ], token),
    ]);
    return attachLineChanges(parseNameStatus(statusOutput), parseNumStat(numStatOutput));
  }

  public async listTreePaths(
    root: string,
    commit: string,
    token?: CancellationToken,
  ): Promise<readonly TreePath[]> {
    validateSha(commit);
    return parsePathList(await this.runLocal(
      root,
      ['ls-tree', '-r', '-z', commit, '--'],
      token,
    ));
  }

  public readBlob(
    root: string,
    commit: string,
    path: string,
    token?: CancellationToken,
  ): Promise<Buffer> {
    validateSha(commit);
    return this.runLocal(root, ['show', `${commit}:${path}`], token);
  }

  public async getBlobSize(
    root: string,
    commit: string,
    path: string,
    token?: CancellationToken,
  ): Promise<number> {
    validateSha(commit);
    const output = await this.runLocal(root, ['cat-file', '-s', `${commit}:${path}`], token);
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

  public readBlobObject(root: string, objectId: string, token?: CancellationToken): Promise<Buffer> {
    validateSha(objectId);
    return this.runLocal(root, ['cat-file', 'blob', objectId], token);
  }

  public async getBlobObjectSize(root: string, objectId: string, token?: CancellationToken): Promise<number> {
    validateSha(objectId);
    return parseBlobSize(await this.runLocal(root, ['cat-file', '-s', objectId], token));
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

  private runLocal(
    root: string,
    args: readonly string[],
    token?: CancellationToken,
  ): Promise<Buffer> {
    return this.runner.run(root, ['--no-lazy-fetch', ...args], token);
  }
}

export function attachLineChanges(
  files: readonly ChangedFile[],
  stats: readonly NumStatRecord[],
): readonly ChangedFile[] {
  const statsByPathPair = new Map<string, NumStatRecord[]>();
  for (const stat of stats) {
    const key = pathPairKey(stat.oldPathKey ?? utf8Key(stat.oldPath), stat.newPathKey ?? utf8Key(stat.newPath));
    const bucket = statsByPathPair.get(key);
    if (bucket) {
      bucket.push(stat);
    } else {
      statsByPathPair.set(key, [stat]);
    }
  }

  const joined = files.map((file) => {
    const [oldPath, newPath] = statPaths(file);
    const key = pathPairKey(oldPath, newPath);
    const bucket = statsByPathPair.get(key);
    if (!bucket) {
      throw new GitOutputError('Missing numstat record for changed file.');
    }
    const stat = bucket.pop();
    if (!stat) {
      throw new GitOutputError('Missing numstat record for changed file.');
    }
    if (bucket.length === 0) {
      statsByPathPair.delete(key);
    }
    return Object.freeze({
      ...file,
      lineChanges: Object.freeze({ ...stat.lineChanges }),
    });
  });

  if (statsByPathPair.size > 0) {
    throw new GitOutputError('Unexpected numstat record for changed file.');
  }
  return joined;
}

function statPaths(file: ChangedFile): readonly [string, string] {
  if (file.status === 'renamed') {
    if (!file.oldPath || !file.newPath) {
      throw new GitOutputError('Missing path for renamed file.');
    }
    return [file.oldPathKey ?? utf8Key(file.oldPath), file.newPathKey ?? utf8Key(file.newPath)];
  }
  const path = file.newPath ?? file.oldPath;
  if (!path) {
    throw new GitOutputError('Missing path for changed file.');
  }
  const key = file.newPathKey ?? file.oldPathKey ?? utf8Key(path);
  return [key, key];
}

function utf8Key(path: string): string {
  return Buffer.from(path, 'utf8').toString('base64url');
}

function parseBlobSize(output: Buffer): number {
  const value = output.toString('utf8').trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new GitOutputError('Invalid blob size output.');
  const size = Number(value);
  if (!Number.isSafeInteger(size)) throw new GitOutputError('Blob size exceeds the supported numeric range.');
  return size;
}

function pathPairKey(oldPath: string, newPath: string): string {
  return `${oldPath}\0${newPath}`;
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
