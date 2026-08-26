import { describe, expect, test } from 'vitest';

import { parseNameStatus } from '../../src/git/parseNameStatus';

const oldOid = '1'.repeat(40);
const newOid = '2'.repeat(40);
const raw = (status: string, ...paths: string[]) => Buffer.from(
  `:100644 100644 ${oldOid} ${newOid} ${status}\0${paths.join('\0')}${paths.length ? '\0' : ''}`,
);

describe('parseNameStatus', () => {
  test('keeps distinct invalid UTF-8 path bytes and blob identities losslessly', () => {
    const firstOid = '2'.repeat(40);
    const secondOid = '3'.repeat(40);
    const output = Buffer.concat([
      Buffer.from(`:100644 100644 ${oldOid} ${firstOid} M\0bad-`, 'ascii'), Buffer.from([0xff]), Buffer.from('.ts\0', 'ascii'),
      Buffer.from(`:100644 100644 ${oldOid} ${secondOid} M\0bad-`, 'ascii'), Buffer.from([0xfe]), Buffer.from('.ts\0', 'ascii'),
    ]);

    const files = parseNameStatus(output);

    expect(files.map((file) => file.newPathKey)).toEqual([
      Buffer.concat([Buffer.from('bad-'), Buffer.from([0xff]), Buffer.from('.ts')]).toString('base64url'),
      Buffer.concat([Buffer.from('bad-'), Buffer.from([0xfe]), Buffer.from('.ts')]).toString('base64url'),
    ]);
    expect(files.map((file) => file.newBlobOid)).toEqual([firstOid, secondOid]);
    expect(new Set(files.map((file) => file.newPathKey)).size).toBe(2);
  });
  test('parses modified files and renames without splitting paths on whitespace', () => {
    expect(parseNameStatus(Buffer.concat([raw('M', 'src/a.ts'), raw('R100', 'old name.ts', 'new name.ts')]))).toMatchObject([
      { status: 'modified', oldPath: 'src/a.ts', newPath: 'src/a.ts' },
      { status: 'renamed', oldPath: 'old name.ts', newPath: 'new name.ts' },
    ]);
  });

  test('parses added, deleted, and Unicode paths', () => {
    expect(parseNameStatus(Buffer.concat([raw('A', '新規.ts'), raw('D', 'removed file.ts')]))).toMatchObject([
      { status: 'added', oldPath: undefined, newPath: '新規.ts' },
      { status: 'deleted', oldPath: 'removed file.ts', newPath: undefined },
    ]);
  });

  test('accepts a final record without a trailing NUL', () => {
    const output = raw('M', 'src/a.ts').subarray(0, -1);
    expect(parseNameStatus(output)).toMatchObject([
      { status: 'modified', oldPath: 'src/a.ts', newPath: 'src/a.ts' },
    ]);
  });

  test('rejects unknown statuses', () => {
    expect(() => parseNameStatus(raw('C100', 'old.ts', 'new.ts'))).toThrowError(
      expect.objectContaining({ name: 'GitOutputError' }),
    );
  });

  test('rejects truncated records without exposing raw output', () => {
    expect(() => parseNameStatus(raw('R100', 'old.ts'))).toThrowError(
      expect.objectContaining({ name: 'GitOutputError' }),
    );
  });
});
