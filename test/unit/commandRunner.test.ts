import type { CancellationToken } from 'vscode';
import { describe, expect, test, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import {
  GitCommandCancelledError,
  GitCommandError,
  GitCommandRunner,
} from '../../src/git/commandRunner';

describe('GitCommandRunner', () => {
  test('does not spawn Git when the cancellation token is already cancelled', async () => {
    const token = {
      isCancellationRequested: true,
      onCancellationRequested: vi.fn(),
    } as unknown as CancellationToken;

    await expect(new GitCommandRunner().run('/repo', ['status'], token))
      .rejects.toBeInstanceOf(GitCommandCancelledError);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(token.onCancellationRequested).not.toHaveBeenCalled();
  });

  test.each([
    ['fatal: https://alice:url-secret-sentinel@example.test/repo.git', 'url-secret-sentinel'],
    ['fatal: https://example.test/repo?access_token=query-secret-sentinel&x=1', 'query-secret-sentinel'],
    ['remote: token=token-secret-sentinel', 'token-secret-sentinel'],
    ['remote: password: password-secret-sentinel', 'password-secret-sentinel'],
  ])('redacts credentials from stored stderr and the user-visible message', (stderr, secret) => {
    const error = new GitCommandError(128, stderr);

    expect(error.stderr).toContain('[REDACTED]');
    expect(error.stderr).not.toContain(secret);
    expect(error.message).not.toContain(secret);
  });
});
