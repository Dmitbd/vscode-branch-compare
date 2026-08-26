export type GitRefKind = 'local' | 'remote';
export type ChangedFileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface GitRef {
  readonly fullName: string;
  readonly displayName: string;
  readonly kind: GitRefKind;
  readonly remote?: string;
  readonly commit: string;
}

export interface ChangedFile {
  readonly status: ChangedFileStatus;
  readonly oldPath: string | undefined;
  readonly newPath: string | undefined;
  readonly lineChanges?: LineChanges;
}

export interface LineChanges {
  readonly additions: number | null;
  readonly deletions: number | null;
}

export type DiffTarget =
  | { readonly kind: 'changed'; readonly file: ChangedFile }
  | { readonly kind: 'unchanged'; readonly path: string };

export interface ChangeSummary {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
}

export interface ComparisonSelection {
  readonly repositoryUri: string;
  readonly baseRef: string;
  readonly compareRef: string;
}

export interface ComparisonResult {
  readonly selection: ComparisonSelection;
  readonly baseSha: string;
  readonly compareSha: string;
  readonly mergeBaseSha: string;
  readonly files: readonly ChangedFile[];
  readonly summary: ChangeSummary;
}

export interface CompleteTreePaths {
  readonly mergeBasePaths: readonly string[];
  readonly comparePaths: readonly string[];
}
