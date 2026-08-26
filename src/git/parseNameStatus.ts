import type { ChangedFile, ChangedFileStatus } from '../domain/model';
import { GitOutputError } from './GitOutputError';

const statusByCode: Readonly<Record<string, ChangedFileStatus>> = {
  A: 'added',
  D: 'deleted',
  M: 'modified',
};

export function parseNameStatus(output: Buffer): ChangedFile[] {
  const fields = output.toString('utf8').split('\0');
  if (fields.at(-1) === '') {
    fields.pop();
  }

  const files: ChangedFile[] = [];
  for (let index = 0; index < fields.length;) {
    const statusField = fields[index++];
    if (!statusField) {
      throw new GitOutputError('Invalid name-status output.');
    }

    if (/^R\d*$/.test(statusField)) {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (!oldPath || !newPath) {
        throw new GitOutputError('Truncated rename record in name-status output.');
      }
      files.push({ status: 'renamed', oldPath, newPath });
      continue;
    }

    const status = statusByCode[statusField];
    if (!status) {
      throw new GitOutputError('Unknown status in name-status output.');
    }

    const path = fields[index++];
    if (!path) {
      throw new GitOutputError('Truncated record in name-status output.');
    }
    files.push(toChangedFile(status, path));
  }

  return files;
}

function toChangedFile(status: ChangedFileStatus, path: string): ChangedFile {
  switch (status) {
    case 'added':
      return { status, oldPath: undefined, newPath: path };
    case 'deleted':
      return { status, oldPath: path, newPath: undefined };
    case 'modified':
      return { status, oldPath: path, newPath: path };
    case 'renamed':
      return { status, oldPath: path, newPath: path };
  }
}
