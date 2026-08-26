import * as vscode from 'vscode';

export const BRANCH_COMPARE_SCHEME = 'branch-compare';

const virtualDocumentPath = '/document';
const repositoryIdPattern = /^[0-9a-f]{16}$/;
const shaPattern = /^[0-9a-f]{40,64}$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

export interface VirtualDocumentRef {
  readonly repositoryId: string;
  readonly commit: string;
  readonly path: string;
  readonly empty: boolean;
}

export class InvalidVirtualUriError extends Error {
  public constructor(options?: ErrorOptions) {
    super('Invalid branch comparison document URI.', options);
    this.name = 'InvalidVirtualUriError';
  }
}

export function createVirtualUri(ref: VirtualDocumentRef): vscode.Uri {
  const validated = validateRef(ref);
  const payload = Buffer.from(JSON.stringify(validated), 'utf8').toString('base64url');
  return vscode.Uri.from({
    scheme: BRANCH_COMPARE_SCHEME,
    path: virtualDocumentPath,
    query: `ref=${payload}`,
  });
}

export function parseVirtualUri(uri: vscode.Uri): VirtualDocumentRef {
  if (
    uri.scheme !== BRANCH_COMPARE_SCHEME
    || uri.authority !== ''
    || uri.path !== virtualDocumentPath
    || uri.fragment !== ''
  ) {
    throw new InvalidVirtualUriError();
  }

  const match = /^ref=([A-Za-z0-9_-]+)$/.exec(uri.query);
  if (!match) {
    throw new InvalidVirtualUriError();
  }

  const payload = match[1];
  if (!base64UrlPattern.test(payload)) {
    throw new InvalidVirtualUriError();
  }

  try {
    const decoded = Buffer.from(payload, 'base64url');
    if (decoded.toString('base64url') !== payload) {
      throw new Error('Non-canonical base64url payload.');
    }
    return validateRef(JSON.parse(decoded.toString('utf8')));
  } catch (error) {
    if (error instanceof InvalidVirtualUriError) {
      throw error;
    }
    throw new InvalidVirtualUriError({ cause: error });
  }
}

function validateRef(value: unknown): VirtualDocumentRef {
  if (!isPlainObject(value)) {
    throw new InvalidVirtualUriError();
  }

  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'commit,empty,path,repositoryId') {
    throw new InvalidVirtualUriError();
  }

  const { repositoryId, commit, path, empty } = value;
  if (
    typeof repositoryId !== 'string'
    || !repositoryIdPattern.test(repositoryId)
    || typeof commit !== 'string'
    || !shaPattern.test(commit)
    || typeof path !== 'string'
    || !isRepositoryRelativePath(path)
    || typeof empty !== 'boolean'
  ) {
    throw new InvalidVirtualUriError();
  }

  return Object.freeze({ repositoryId, commit, path, empty });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRepositoryRelativePath(path: string): boolean {
  if (
    path.length === 0
    || path.includes('\0')
    || path.startsWith('/')
    || path.startsWith('\\\\')
    || /^[A-Za-z]:[\\/]/.test(path)
  ) {
    return false;
  }
  return !path.split('/').some((segment) => segment === '.' || segment === '..');
}
