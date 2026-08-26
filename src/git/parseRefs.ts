import type { GitRef } from '../domain/model';
import { GitOutputError } from './GitOutputError';

const localPrefix = 'refs/heads/';
const remotePrefix = 'refs/remotes/';

export function parseRefs(output: Buffer): GitRef[] {
  const refs: GitRef[] = [];

  for (const record of output.toString('utf8').split('\n')) {
    if (record === '') {
      continue;
    }

    const [fullName, commit, symbolicTarget, ...extraFields] = record.split('\0');
    if (extraFields.length > 0 || !fullName || !commit) {
      throw new GitOutputError('Invalid ref output.');
    }

    if (fullName.startsWith(localPrefix)) {
      const displayName = fullName.slice(localPrefix.length);
      if (!displayName) {
        throw new GitOutputError('Invalid local ref output.');
      }
      refs.push({ fullName, displayName, kind: 'local', commit });
      continue;
    }

    if (!fullName.startsWith(remotePrefix)) {
      continue;
    }

    const remoteAndBranch = fullName.slice(remotePrefix.length);
    const separator = remoteAndBranch.indexOf('/');
    const remote = remoteAndBranch.slice(0, separator);
    const branch = remoteAndBranch.slice(separator + 1);
    if (!remote || !branch) {
      throw new GitOutputError('Invalid remote ref output.');
    }
    if (branch === 'HEAD') {
      continue;
    }
    if (symbolicTarget) {
      continue;
    }

    refs.push({
      fullName,
      displayName: remoteAndBranch,
      kind: 'remote',
      remote,
      commit,
    });
  }

  return refs;
}
