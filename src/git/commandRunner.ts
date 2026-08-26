import { spawn } from 'node:child_process';
import type { CancellationToken } from 'vscode';

const maximumStderrBytes = 64 * 1024;

export interface CommandRunner {
  run(cwd: string, args: readonly string[], token?: CancellationToken): Promise<Buffer>;
}

export class GitCommandError extends Error {
  public readonly stderr: string;

  public constructor(
    public readonly exitCode: number | null,
    stderr: string,
  ) {
    const sanitizedStderr = sanitizeErrorText(stderr);
    const detail = sanitizedStderr || 'Git did not provide an error message.';
    super(`Git exited with code ${exitCode ?? 'unknown'}: ${detail}`);
    this.name = 'GitCommandError';
    this.stderr = sanitizedStderr;
  }
}

export class GitCommandCancelledError extends Error {
  public constructor() {
    super('Git command cancelled.');
    this.name = 'GitCommandCancelledError';
  }
}

export class GitCommandRunner implements CommandRunner {
  public constructor(private readonly gitExecutable = 'git') {}

  public run(cwd: string, args: readonly string[], token?: CancellationToken): Promise<Buffer> {
    if (token?.isCancellationRequested) {
      return Promise.reject(new GitCommandCancelledError());
    }

    return new Promise((resolve, reject) => {
      const child = spawn(this.gitExecutable, [...args], {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stderrBytes = 0;
      let cancelled = false;
      let settled = false;

      const settle = (action: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        cancellationDisposable?.dispose();
        action();
      };

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        const remaining = maximumStderrBytes - stderrBytes;
        if (remaining <= 0) {
          return;
        }
        const captured = chunk.subarray(0, remaining);
        stderrChunks.push(captured);
        stderrBytes += captured.length;
      });

      child.once('error', (error) => {
        settle(() => reject(new GitCommandError(null, error.message)));
      });
      child.once('close', (exitCode) => {
        settle(() => {
          if (cancelled) {
            reject(new GitCommandCancelledError());
            return;
          }
          if (exitCode === 0) {
            resolve(Buffer.concat(stdoutChunks));
            return;
          }
          reject(new GitCommandError(exitCode, Buffer.concat(stderrChunks).toString('utf8')));
        });
      });

      const cancellationDisposable = token?.onCancellationRequested(() => {
        cancelled = true;
        child.kill();
      });
    });
  }
}

function sanitizeErrorText(text: string): string {
  return text
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\b(https?:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@')
    .replace(
      /(\b(?:access[_-]?token|token|password)\b\s*(?:=|:)\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&;,]+)/gi,
      '$1[REDACTED]',
    )
    .trim();
}
