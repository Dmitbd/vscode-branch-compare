import { GitOutputError } from './GitOutputError';
import type { TreePath } from '../domain/model';
import { gitPath, splitNul } from './gitPath';

export function parsePathList(output: Buffer): TreePath[] {
  if (output.length > 0 && output.at(-1) !== 0) throw new GitOutputError('Invalid tree path output.');
  return splitNul(output, 'Invalid tree path output.').map((record) => {
    const tab = record.indexOf(0x09);
    if (tab < 0) return gitPath(record).path;
    const header = record.subarray(0, tab).toString('ascii');
    const match = /^([0-7]{6}) (blob|commit) ([0-9a-f]{40,64})$/.exec(header);
    if (!match) throw new GitOutputError('Invalid tree path output.');
    const [, mode, type, oid] = match;
    if ((mode === '160000') !== (type === 'commit')) throw new GitOutputError('Invalid tree path output.');
    const identity = gitPath(record.subarray(tab + 1));
    return Object.freeze({ ...identity, blobOid: oid, objectKind: type === 'commit' ? 'gitlink' : 'blob' });
  });
}
