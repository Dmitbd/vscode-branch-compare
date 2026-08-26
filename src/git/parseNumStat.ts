import type { LineChanges } from '../domain/model';
import { GitOutputError } from './GitOutputError';
import { gitPath, splitNul } from './gitPath';

export interface NumStatRecord {
  readonly oldPath: string;
  readonly newPath: string;
  readonly oldPathKey?: string;
  readonly newPathKey?: string;
  readonly lineChanges: LineChanges;
}

export function parseNumStat(output: Buffer): NumStatRecord[] {
  const fields = splitNul(output, 'Invalid numstat output.');
  const records: NumStatRecord[] = [];
  for (let index = 0; index < fields.length;) {
    const headerBuffer = fields[index++];
    const header = headerBuffer?.toString('ascii');
    if (header === undefined) throw invalid();
    const firstTab = header.indexOf('\t');
    const secondTab = firstTab < 0 ? -1 : header.indexOf('\t', firstTab + 1);
    if (firstTab <= 0 || secondTab < 0) throw invalid();
    const lineChanges = parseCounts(
      header.slice(0, firstTab),
      header.slice(firstTab + 1, secondTab),
    );
    const pathBytes = headerBuffer.subarray(secondTab + 1);
    if (pathBytes.length !== 0) {
      const path = gitPath(pathBytes);
      records.push({ oldPath: path.path, newPath: path.path, oldPathKey: path.pathKey, newPathKey: path.pathKey, lineChanges });
      continue;
    }
    const oldPath = gitPath(fields[index++] ?? Buffer.alloc(0));
    const newPath = gitPath(fields[index++] ?? Buffer.alloc(0));
    records.push({ oldPath: oldPath.path, newPath: newPath.path, oldPathKey: oldPath.pathKey, newPathKey: newPath.pathKey, lineChanges });
  }
  return records;
}

function parseCounts(additions: string, deletions: string): LineChanges {
  if (additions === '-' && deletions === '-') return { additions: null, deletions: null };
  if (!/^\d+$/.test(additions) || !/^\d+$/.test(deletions)) throw invalid();
  const parsed = { additions: Number(additions), deletions: Number(deletions) };
  if (!Number.isSafeInteger(parsed.additions) || !Number.isSafeInteger(parsed.deletions)) throw invalid();
  return parsed;
}

function invalid(): GitOutputError {
  return new GitOutputError('Invalid numstat output.');
}
