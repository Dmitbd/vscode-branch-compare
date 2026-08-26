import { describe, expect, test } from 'vitest';
import { parsePathList } from '../../src/git/parsePathList';

describe('parsePathList', () => {
  test('returns lossless path keys and blob OIDs for invalid UTF-8 tree names', () => {
    const firstOid = 'a'.repeat(40);
    const secondOid = 'b'.repeat(40);
    const output = Buffer.concat([
      Buffer.from(`100644 blob ${firstOid}\tbad-`, 'ascii'), Buffer.from([0xff]), Buffer.from('.ts\0', 'ascii'),
      Buffer.from(`100644 blob ${secondOid}\tbad-`, 'ascii'), Buffer.from([0xfe]), Buffer.from('.ts\0', 'ascii'),
    ]);

    const entries = parsePathList(output);

    expect(entries.map((entry) => entry.pathKey)).toEqual([
      Buffer.concat([Buffer.from('bad-'), Buffer.from([0xff]), Buffer.from('.ts')]).toString('base64url'),
      Buffer.concat([Buffer.from('bad-'), Buffer.from([0xfe]), Buffer.from('.ts')]).toString('base64url'),
    ]);
    expect(entries.map((entry) => entry.blobOid)).toEqual([firstOid, secondOid]);
  });
  test('keeps gitlinks as non-blob tree entries without rejecting the snapshot', () => {
    const oid = 'c'.repeat(40);
    expect(parsePathList(Buffer.from(`160000 commit ${oid}\tsubmodule\0`))).toEqual([{
      path: 'submodule', pathKey: Buffer.from('submodule').toString('base64url'), blobOid: oid,
      objectKind: 'gitlink',
    }]);
  });
  test('parses NUL-delimited Unicode paths', () => {
    expect(parsePathList(Buffer.from('README.md\0src/файл.ts\0')))
      .toEqual(['README.md', 'src/файл.ts']);
  });

  test('preserves backslashes and drive-like prefixes as literal Git filename characters', () => {
    expect(parsePathList(Buffer.from('src\\..\\literal.ts\0C:\\folder\\file.ts\0\\\\server-name\0')))
      .toEqual(['src\\\\..\\\\literal.ts', 'C:\\\\folder\\\\file.ts', '\\\\\\\\server-name']);
  });

  test.each(['src/a.ts', '\0', '/absolute.ts\0', '../escape.ts\0'])
    ('rejects malformed path output %j', (value) => {
      expect(() => parsePathList(Buffer.from(value))).toThrow();
    });
});
