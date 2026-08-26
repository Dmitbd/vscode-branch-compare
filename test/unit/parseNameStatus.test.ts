import { describe, expect, test } from 'vitest';

import { parseNameStatus } from '../../src/git/parseNameStatus';

describe('parseNameStatus', () => {
  test('parses modified files and renames without splitting paths on whitespace', () => {
    expect(parseNameStatus(Buffer.from('M\0src/a.ts\0R100\0old name.ts\0new name.ts\0'))).toEqual([
      { status: 'modified', oldPath: 'src/a.ts', newPath: 'src/a.ts' },
      { status: 'renamed', oldPath: 'old name.ts', newPath: 'new name.ts' },
    ]);
  });

  test('parses added, deleted, and Unicode paths', () => {
    expect(parseNameStatus(Buffer.from('A\0新規.ts\0D\0removed file.ts\0'))).toEqual([
      { status: 'added', oldPath: undefined, newPath: '新規.ts' },
      { status: 'deleted', oldPath: 'removed file.ts', newPath: undefined },
    ]);
  });

  test('accepts a final record without a trailing NUL', () => {
    expect(parseNameStatus(Buffer.from('M\0src/a.ts'))).toEqual([
      { status: 'modified', oldPath: 'src/a.ts', newPath: 'src/a.ts' },
    ]);
  });

  test('rejects unknown statuses', () => {
    expect(() => parseNameStatus(Buffer.from('C100\0old.ts\0new.ts\0'))).toThrowError(
      expect.objectContaining({ name: 'GitOutputError' }),
    );
  });

  test('rejects truncated records without exposing raw output', () => {
    expect(() => parseNameStatus(Buffer.from('R100\0old.ts\0'))).toThrowError(
      expect.objectContaining({ name: 'GitOutputError' }),
    );
  });
});
