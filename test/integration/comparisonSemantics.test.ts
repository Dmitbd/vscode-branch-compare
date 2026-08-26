import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ComparisonService } from '../../src/compare/comparisonService';
import { DefaultGitAdapter } from '../../src/git/gitAdapter';
import { GitRepo } from '../helpers/gitRepo';

describe('ComparisonService merge-request semantics', () => {
  let repo: GitRepo;

  beforeEach(async () => {
    repo = await GitRepo.create();
  });

  afterEach(async () => {
    await repo.dispose();
  });

  test('includes only compare-side changes after divergence and reads the left blob from merge-base', async () => {
    await repo.write('shared.txt', 'content at A\n');
    const baseCommit = await repo.commit('A');

    await repo.git(['switch', '-c', 'feature']);
    await repo.write('feature-only.txt', 'content at F\n');
    const featureCommit = await repo.commit('F');

    await repo.git(['switch', 'main']);
    await repo.write('base-only.txt', 'content at B\n');
    await repo.write('shared.txt', 'content at B\n');
    const mainCommit = await repo.commit('B');

    const adapter = new DefaultGitAdapter();
    const result = await new ComparisonService(adapter).compare(repo.root, {
      repositoryUri: `file://${repo.root}`,
      baseRef: 'refs/heads/main',
      compareRef: 'refs/heads/feature',
    });

    expect(result).toMatchObject({
      baseSha: mainCommit,
      compareSha: featureCommit,
      mergeBaseSha: baseCommit,
      files: [
        { status: 'added', oldPath: undefined, newPath: 'feature-only.txt' },
      ],
    });
    expect(await adapter.readBlob(repo.root, result.mergeBaseSha, 'shared.txt'))
      .toEqual(Buffer.from('content at A\n'));
  });
});
