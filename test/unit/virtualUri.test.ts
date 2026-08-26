import { describe, expect, test, vi } from 'vitest';

vi.mock('vscode', () => {
  class Uri {
    public readonly scheme: string;
    public readonly authority: string;
    public readonly path: string;
    public readonly query: string;
    public readonly fragment: string;

    public constructor(parts: {
      scheme: string;
      authority?: string;
      path?: string;
      query?: string;
      fragment?: string;
    }) {
      this.scheme = parts.scheme;
      this.authority = parts.authority ?? '';
      this.path = parts.path ?? '';
      this.query = parts.query ?? '';
      this.fragment = parts.fragment ?? '';
    }

    public static from(parts: ConstructorParameters<typeof Uri>[0]): Uri {
      return new Uri(parts);
    }

    public toString(): string {
      const authority = this.authority ? `//${this.authority}` : '';
      const query = this.query ? `?${this.query}` : '';
      const fragment = this.fragment ? `#${this.fragment}` : '';
      return `${this.scheme}:${authority}${this.path}${query}${fragment}`;
    }
  }

  return { Uri };
});

import { Uri } from 'vscode';
import {
  BRANCH_COMPARE_SCHEME,
  InvalidVirtualUriError,
  createVirtualUri,
  parseVirtualUri,
  type VirtualDocumentRef,
} from '../../src/content/virtualUri';

const repositoryId = '0123456789abcdef';
const commit = 'a'.repeat(40);

describe('virtual Git document URI', () => {
  test.each([
    'src/file with spaces.ts',
    'папка/файл-🚀.ts',
    'docs/topic#section?.md',
  ])('round-trips a safe reference for path %s', (path) => {
    const ref: VirtualDocumentRef = { repositoryId, commit, path, empty: false };

    const uri = createVirtualUri(ref);

    expect(uri.scheme).toBe(BRANCH_COMPARE_SCHEME);
    expect(uri.authority).toBe('');
    expect(uri.path).toBe('/document');
    expect(uri.query).toMatch(/^ref=[A-Za-z0-9_-]+$/);
    expect(uri.toString()).not.toContain(path);
    expect(parseVirtualUri(uri)).toEqual(ref);
  });

  test('round-trips an empty-side reference without placing a repository root in the URI', () => {
    const uri = createVirtualUri({ repositoryId, commit, path: 'new.txt', empty: true });

    expect(parseVirtualUri(uri)).toEqual({ repositoryId, commit, path: 'new.txt', empty: true });
    expect(uri.toString()).not.toContain('/workspace/project');
  });

  test.each([
    [{ repositoryId: 'file:///workspace/project', commit, path: 'a.ts', empty: false }, 'repository id'],
    [{ repositoryId, commit: 'main', path: 'a.ts', empty: false }, 'commit'],
    [{ repositoryId, commit, path: '', empty: false }, 'path'],
    [{ repositoryId, commit, path: '/workspace/project/a.ts', empty: false }, 'path'],
  ])('rejects an invalid %s while creating a URI', (ref) => {
    expect(() => createVirtualUri(ref)).toThrow(InvalidVirtualUriError);
  });

  test.each([
    Uri.from({ scheme: 'file', path: '/document', query: 'ref=abc' }),
    Uri.from({ scheme: BRANCH_COMPARE_SCHEME, path: '/document', query: 'ref=%%%' }),
    Uri.from({ scheme: BRANCH_COMPARE_SCHEME, path: '/document', query: 'ref=e30' }),
    Uri.from({ scheme: BRANCH_COMPARE_SCHEME, path: '/document', query: 'payload=abc' }),
    Uri.from({ scheme: BRANCH_COMPARE_SCHEME, path: '/document', query: 'ref=abc&ref=def' }),
  ])('rejects malformed or foreign URI payloads', (uri) => {
    expect(() => parseVirtualUri(uri)).toThrow(InvalidVirtualUriError);
  });

  test('rejects a decoded payload whose property types are invalid', () => {
    const payload = Buffer.from(JSON.stringify({
      repositoryId,
      commit,
      path: 'a.ts',
      empty: 'false',
    })).toString('base64url');
    const uri = Uri.from({ scheme: BRANCH_COMPARE_SCHEME, path: '/document', query: `ref=${payload}` });

    expect(() => parseVirtualUri(uri)).toThrow(InvalidVirtualUriError);
  });
});
