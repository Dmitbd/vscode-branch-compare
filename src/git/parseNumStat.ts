import type { LineChanges } from '../domain/model';
import { GitOutputError } from './GitOutputError';

export interface NumStatRecord {
  readonly oldPath: string;
  readonly newPath: string;
  readonly lineChanges: LineChanges;
}

export function parseNumStat(output: Buffer): NumStatRecord[] {
  const fields = output.toString('utf8').split('\0');
  if (fields.at(-1) === '') fields.pop();
  const records: NumStatRecord[] = [];
  for (let index = 0; index < fields.length;) {
    const header = fields[index++];
    if (header === undefined) throw invalid();
    const firstTab = header.indexOf('\t');
    const secondTab = firstTab < 0 ? -1 : header.indexOf('\t', firstTab + 1);
    if (firstTab <= 0 || secondTab < 0) throw invalid();
    const lineChanges = parseCounts(
      header.slice(0, firstTab),
      header.slice(firstTab + 1, secondTab),
    );
    const path = header.slice(secondTab + 1);
    if (path !== '') {
      records.push({ oldPath: path, newPath: path, lineChanges });
      continue;
    }
    const oldPath = fields[index++];
    const newPath = fields[index++];
    if (!oldPath || !newPath) throw invalid();
    records.push({ oldPath, newPath, lineChanges });
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
