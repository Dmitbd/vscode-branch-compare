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

  test('treats tabs and line breaks inside normal and renamed paths as opaque filename bytes', () => {
    const output = Buffer.from(
      '1\t2\tsrc/line\nbreak\tand-tab.ts\0'
      + '3\t4\t\0old\nname\t.ts\0new\tname\n.ts\0',
    );

    expect(parseNumStat(output)).toEqual([
      {
        oldPath: 'src/line\nbreak\tand-tab.ts',
        newPath: 'src/line\nbreak\tand-tab.ts',
        lineChanges: { additions: 1, deletions: 2 },
      },
      {
        oldPath: 'old\nname\t.ts',
        newPath: 'new\tname\n.ts',
        lineChanges: { additions: 3, deletions: 4 },
      },
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
