import type { ChangedFile, ChangedFileStatus } from '../domain/model';
import { GitOutputError } from './GitOutputError';
import { gitPath, splitNul } from './gitPath';

const statusByCode: Readonly<Record<string, ChangedFileStatus>> = {
  A: 'added',
  D: 'deleted',
  M: 'modified',
};

export function parseNameStatus(output: Buffer): ChangedFile[] {
  return parseRaw(output);
}

function parseRaw(output: Buffer): ChangedFile[] {
  const fields = splitNul(output, 'Invalid raw diff output.');
  const files: ChangedFile[] = [];
  for (let index = 0; index < fields.length;) {
    const header = fields[index++]?.toString('ascii');
    const match = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40,64}) ([0-9a-f]{40,64}) ([ADM]|R\d*)$/.exec(header ?? '');
    if (!match) throw new GitOutputError('Invalid raw diff output.');
    const [, oldMode, newMode, oldBlobOid, newBlobOid, code] = match;
    const oldObjectKind = objectKind(oldMode);
    const newObjectKind = objectKind(newMode);
    const oldPathIdentity = gitPath(fields[index++] ?? Buffer.alloc(0));
    if (code.startsWith('R')) {
      const newPathIdentity = gitPath(fields[index++] ?? Buffer.alloc(0));
      files.push({ status: 'renamed', oldPath: oldPathIdentity.path, newPath: newPathIdentity.path,
        oldPathKey: oldPathIdentity.pathKey, newPathKey: newPathIdentity.pathKey, oldBlobOid, newBlobOid,
        oldObjectKind, newObjectKind });
    } else {
      const status = statusByCode[code];
      if (!status) throw new GitOutputError('Unknown status in raw diff output.');
      files.push({ ...toChangedFile(status, oldPathIdentity.path),
        oldPathKey: status === 'added' ? undefined : oldPathIdentity.pathKey,
        newPathKey: status === 'deleted' ? undefined : oldPathIdentity.pathKey,
        oldBlobOid: status === 'added' ? undefined : oldBlobOid,
        newBlobOid: status === 'deleted' ? undefined : newBlobOid,
        oldObjectKind: status === 'added' ? undefined : oldObjectKind,
        newObjectKind: status === 'deleted' ? undefined : newObjectKind });
    }
  }
  return files;
}

function objectKind(mode: string): 'blob' | 'gitlink' {
  return mode === '160000' ? 'gitlink' : 'blob';
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
