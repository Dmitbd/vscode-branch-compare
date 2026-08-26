import { GitOutputError } from './GitOutputError';

export function parsePathList(output: Buffer): string[] {
  const text = output.toString('utf8');
  if (text === '') return [];
  if (!text.endsWith('\0')) throw new GitOutputError('Invalid tree path output.');
  const paths = text.slice(0, -1).split('\0');
  if (paths.some((path) => !isRepositoryRelativePath(path))) {
    throw new GitOutputError('Invalid tree path output.');
  }
  return paths;
}

function isRepositoryRelativePath(path: string): boolean {
  if (
    path.length === 0
    || path.includes('\0')
    || path.startsWith('/')
  ) {
    return false;
  }
  return !path.split('/').some((segment) => segment === '.' || segment === '..');
}
