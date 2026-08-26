import type { ChangedFile, ChangeSummary } from '../domain/model';

const defaultMaximumEntries = 16;

export interface ComparisonData {
  readonly baseSha: string;
  readonly compareSha: string;
  readonly mergeBaseSha: string;
  readonly files: readonly ChangedFile[];
  readonly summary: ChangeSummary;
}

export class ComparisonCache {
  private readonly entries = new Map<string, ComparisonData>();

  public constructor(private readonly maximumEntries = defaultMaximumEntries) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1) {
      throw new RangeError('Comparison cache size must be a positive integer.');
    }
  }

  public get(
    repositoryUri: string,
    baseSha: string,
    compareSha: string,
  ): ComparisonData | undefined {
    const key = createKey(repositoryUri, baseSha, compareSha);
    const data = this.entries.get(key);
    if (!data) {
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, data);
    return data;
  }

  public set(
    repositoryUri: string,
    baseSha: string,
    compareSha: string,
    data: ComparisonData,
  ): void {
    const key = createKey(repositoryUri, baseSha, compareSha);
    this.entries.delete(key);
    this.entries.set(key, data);
    this.evictOldestEntries();
  }

  private evictOldestEntries(): void {
    while (this.entries.size > this.maximumEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }
}

function createKey(repositoryUri: string, baseSha: string, compareSha: string): string {
  return JSON.stringify([repositoryUri, baseSha, compareSha]);
}
