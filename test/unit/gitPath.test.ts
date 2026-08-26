import { describe, expect, test } from 'vitest';
import { gitPath } from '../../src/git/gitPath';

describe('gitPath safe display', () => {
  test('distinguishes literal escape text from tab, newline, and invalid bytes', () => {
    expect(gitPath(Buffer.from('a\\tb')).path).toBe('a\\\\tb');
    expect(gitPath(Buffer.from('a\tb')).path).toBe('a\\tb');
    expect(gitPath(Buffer.from('a\nb')).path).toBe('a\\nb');
    expect(gitPath(Buffer.from('bad\\xFF')).path).toBe('bad\\\\xFF');
    expect(gitPath(Buffer.concat([Buffer.from('bad'), Buffer.from([0xff])])).path).toBe('bad\\xFF');
  });

  test('escapes bidi, zero-width, C0, C1, and DEL controls deterministically', () => {
    expect(gitPath(Buffer.from(`a\u202Eb\u200Bc`)).path).toBe('a\\u{202E}b\\u{200B}c');
    expect(gitPath(Buffer.from([0x61, 0x01, 0x7f, 0xc2, 0x85, 0x62])).path)
      .toBe('a\\x01\\x7F\\u{85}b');
    expect(gitPath(Buffer.from([0x61, 0x85, 0x62])).path).toBe('a\\x85b');
  });
});
