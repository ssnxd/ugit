/**
 * TypeScript mirrors of the `ugit-core` domain types. These must stay in sync
 * with `crates/ugit-core/src/model.rs` (serde uses kebab-case for the enums).
 */

export type DiffKind =
  | "branch-to-branch"
  | "worktree-to-worktree"
  | "commit-to-commit"
  | "ref-to-ref";

export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "copied";

export type FileChange = {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  binary: boolean;
  additions: number;
  deletions: number;
};

export type DiffSummary = {
  files: FileChange[];
  totalAdditions: number;
  totalDeletions: number;
};

export type DiffLineKind = "context" | "addition" | "deletion";

export type DiffLine = {
  kind: DiffLineKind;
  oldLine: number | null;
  newLine: number | null;
  content: string;
};

export type Hunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

export type FileDiffDetail = {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  binary: boolean;
  hunks: Hunk[];
};

export type Diff = {
  id: string;
  repoPath: string;
  leftRef: string;
  rightRef: string;
  kind: DiffKind;
  createdAt: number;
};

export type Comment = {
  id: string;
  diffId: string;
  filePath: string | null;
  line: number | null;
  side: string | null;
  body: string;
  createdAt: number;
};
