import { describe, expect, test } from 'vitest';
import { parseNumStat } from '../../src/git/parseNumStat';

describe('parseNumStat', () => {
  test('parses text, binary, and rename records without splitting whitespace', () => {
    const output = Buffer.from(
      '10\t4\tsrc/file name.ts\0-\t-\tasset.bin\0'
      + '3\t2\t\0old name.ts\0new name.ts\0',
    );
    expect(parseNumStat(output)).toEqual([
      { oldPath: 'src/file name.ts', newPath: 'src/file name.ts', lineChanges: { additions: 10, deletions: 4 } },
      { oldPath: 'asset.bin', newPath: 'asset.bin', lineChanges: { additions: null, deletions: null } },
      { oldPath: 'old name.ts', newPath: 'new name.ts', lineChanges: { additions: 3, deletions: 2 } },
    ]);
  });

  test.each([
    '1\t2',
    'x\t2\tfile.ts\0',
    '1\t-\tfile.ts\0',
    '1\t2\t\0old.ts\0',
  ])('rejects malformed output %j', (value) => {
    expect(() => parseNumStat(Buffer.from(value))).toThrowError(
      expect.objectContaining({ name: 'GitOutputError' }),
    );
  });
});
