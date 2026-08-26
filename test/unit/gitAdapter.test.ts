import { describe, expect, test, vi } from 'vitest';
import type { ChangedFile } from '../../src/domain/model';
import type { NumStatRecord } from '../../src/git/parseNumStat';
import { attachLineChanges, DefaultGitAdapter } from '../../src/git/gitAdapter';

const fromSha = 'a'.repeat(40);
const toSha = 'b'.repeat(40);

describe('DefaultGitAdapter command boundary', () => {
  test('runs every local read with no lazy fetch and hermetic commit-bound diff options', async () => {
    const run = vi.fn(async (_root: string, args: readonly string[]) => responseFor(args));
    const adapter = new DefaultGitAdapter({ run });

    await adapter.listRefs('/repo');
    await adapter.findRemoteHead('/repo', 'origin');
    await adapter.resolveCommit('/repo', 'refs/heads/main');
    await adapter.findMergeBase('/repo', fromSha, toSha);
    await adapter.listChangedFiles('/repo', fromSha, toSha);
    await adapter.listTreePaths('/repo', fromSha);
    await adapter.readBlob('/repo', fromSha, 'src/file.ts');
    await adapter.getBlobSize('/repo', fromSha, 'src/file.ts');
    await adapter.readBlobObject('/repo', fromSha);
    await adapter.getBlobObjectSize('/repo', fromSha);
    await adapter.fetch('/repo', 'origin');

    const calls = run.mock.calls.map((call) => call[1]);
    const fetchCall = calls.find((args) => args.includes('fetch'));
    const readCalls = calls.filter((args) => args !== fetchCall);
    expect(readCalls).not.toHaveLength(0);
    expect(readCalls.every((args) => args[0] === '--no-lazy-fetch')).toBe(true);
    expect(fetchCall?.[0]).toBe('fetch');
    expect(fetchCall).not.toContain('--no-lazy-fetch');
    expect(calls).toContainEqual(['--no-lazy-fetch', 'cat-file', 'blob', fromSha]);

    const diffCalls = calls.filter((args) => args.includes('diff'));
    expect(diffCalls).toHaveLength(2);
    for (const args of diffCalls) {
      expect(args.slice(0, 3)).toEqual([
        '--no-lazy-fetch',
        `--attr-source=${fromSha}`,
        'diff',
      ]);
      expect(args).toContain('--no-ext-diff');
      expect(args).toContain('--no-textconv');
    }
  });
});

describe('attachLineChanges', () => {
  test('consumes every exact old/new path pair and rejects unmatched numstat records', () => {
    const files: readonly ChangedFile[] = [
      { status: 'modified', oldPath: 'src/a.ts', newPath: 'src/a.ts' },
    ];
    const stats: readonly NumStatRecord[] = [
      { oldPath: 'src/a.ts', newPath: 'src/a.ts', lineChanges: { additions: 1, deletions: 2 } },
      { oldPath: 'src/unexpected.ts', newPath: 'src/unexpected.ts', lineChanges: { additions: 3, deletions: 4 } },
    ];

    expect(() => attachLineChanges(files, stats)).toThrow('Unexpected numstat record');
  });

  test('joins 10,000 exact path pairs with a linear record-read budget', () => {
    const count = 10_000;
    const files: readonly ChangedFile[] = Array.from({ length: count }, (_, index) => ({
      status: 'modified' as const,
      oldPath: `src/file-${index}.ts`,
      newPath: `src/file-${index}.ts`,
    }));
    const records = Array.from({ length: count }, (_, index): NumStatRecord => ({
      oldPath: `src/file-${index}.ts`,
      newPath: `src/file-${index}.ts`,
      lineChanges: { additions: index, deletions: 1 },
    }));
    let indexedReads = 0;
    const observedRecords = new Proxy(records, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^(?:0|[1-9][0-9]*)$/.test(property)) {
          indexedReads += 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const joined = attachLineChanges(files, observedRecords);

    expect(joined).toHaveLength(count);
    expect(joined[9_999]?.lineChanges).toEqual({ additions: 9_999, deletions: 1 });
    expect(indexedReads).toBeLessThanOrEqual(count * 2);
  });
});

function responseFor(args: readonly string[]): Buffer {
  if (args.includes('symbolic-ref')) return Buffer.from('refs/remotes/origin/main\n');
  if (args.includes('rev-parse')) return Buffer.from(`${fromSha}\n`);
  if (args.includes('merge-base')) return Buffer.from(`${fromSha}\n`);
  if (args.includes('--raw')) return Buffer.from(`:100644 100644 ${fromSha} ${toSha} M\0src/file.ts\0`);
  if (args.includes('--numstat')) return Buffer.from('1\t2\tsrc/file.ts\0');
  if (args.includes('cat-file')) return Buffer.from('4\n');
  if (args.includes('show')) return Buffer.from('text');
  return Buffer.alloc(0);
}
