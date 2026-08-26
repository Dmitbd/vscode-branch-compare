import { describe, expect, test } from 'vitest';

import { parseRefs } from '../../src/git/parseRefs';

describe('parseRefs', () => {
  test('parses local and remote branches', () => {
    expect(parseRefs(Buffer.from(
      'refs/heads/main\0aaa\0\n' +
      'refs/remotes/origin/feature/x\0bbb\0\n' +
      'refs/remotes/origin/HEAD\0aaa\0refs/remotes/origin/main\n',
    ))).toEqual([
      { fullName: 'refs/heads/main', displayName: 'main', kind: 'local', commit: 'aaa' },
      { fullName: 'refs/remotes/origin/feature/x', displayName: 'origin/feature/x', kind: 'remote', remote: 'origin', commit: 'bbb' },
    ]);
  });

  test('excludes every symbolic remote HEAD row', () => {
    expect(parseRefs(Buffer.from(
      'refs/remotes/origin/HEAD\0aaa\0\n' +
      'refs/remotes/upstream/HEAD\0bbb\0refs/remotes/upstream/main\n',
    ))).toEqual([]);
  });

  test('accepts the final ref record without a trailing NUL', () => {
    expect(parseRefs(Buffer.from('refs/heads/фича\0abc'))).toEqual([
      { fullName: 'refs/heads/фича', displayName: 'фича', kind: 'local', commit: 'abc' },
    ]);
  });
});
