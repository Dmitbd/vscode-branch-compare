import { IdenticalSelectionError, MissingRefError, NoCommonAncestorError } from '../compare/comparisonService';
import { BinaryBlobError, BlobTooLargeError } from '../content/gitContentProvider';
import { GitCommandError } from '../git/commandRunner';

export class UserFacingError extends Error {
  public constructor(message: string, public readonly technicalError?: unknown) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function toUserFacingError(error: unknown): UserFacingError {
  if (error instanceof UserFacingError) {
    return error;
  }
  if (error instanceof MissingRefError) {
    return new UserFacingError('The selected branch no longer exists', error);
  }
  if (error instanceof NoCommonAncestorError) {
    return new UserFacingError('The branches do not share a common ancestor', error);
  }
  if (error instanceof IdenticalSelectionError) {
    return new UserFacingError('No changes between the merge base and compare branch', error);
  }
  if (error instanceof BinaryBlobError) {
    return new UserFacingError('This file is binary and cannot be shown as a text diff', error);
  }
  if (error instanceof BlobTooLargeError) {
    return new UserFacingError('This file exceeds the 10 MiB text preview limit', error);
  }
  if (isMissingGitObjectError(error)) {
    return new UserFacingError(
      'Required Git objects are unavailable locally; run Fetch and try again',
      error,
    );
  }
  return new UserFacingError('Unable to compare branches', error);
}

export function isMissingGitObjectError(error: unknown): error is GitCommandError {
  return error instanceof GitCommandError
    && /(?:could not (?:fetch|get object info)|promisor|missing object|bad object)/i.test(error.stderr);
}

export function technicalErrorText(error: unknown): string {
  const raw = error instanceof Error ? error.stack ?? error.message : String(error);
  return raw
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\b(https?:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@')
    .replace(
      /(\b(?:x[_-]?api[_-]?key|api[_-]?key|client[_-]?secret|private[_-]?token|refresh[_-]?token|access[_-]?token|token|password)\b\s*(?:=|:)\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&;,]+)/gi,
      '$1[REDACTED]',
    )
    .trim();
}
