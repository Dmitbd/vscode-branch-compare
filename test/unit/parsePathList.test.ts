import { describe, expect, test } from 'vitest';
import { parsePathList } from '../../src/git/parsePathList';

describe('parsePathList', () => {
  test('parses NUL-delimited Unicode paths', () => {
    expect(parsePathList(Buffer.from('README.md\0src/файл.ts\0')))
      .toEqual(['README.md', 'src/файл.ts']);
  });

  test('preserves backslashes and drive-like prefixes as literal Git filename characters', () => {
    expect(parsePathList(Buffer.from('src\\..\\literal.ts\0C:\\folder\\file.ts\0\\\\server-name\0')))
      .toEqual(['src\\..\\literal.ts', 'C:\\folder\\file.ts', '\\\\server-name']);
  });

  test.each(['src/a.ts', '\0', '/absolute.ts\0', '../escape.ts\0'])
    ('rejects malformed path output %j', (value) => {
      expect(() => parsePathList(Buffer.from(value))).toThrow();
    });
});
