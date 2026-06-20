/**
 * Typed wrappers around the Tauri commands defined in `src-tauri/src/lib.rs`.
 *
 * Every backend call goes through here so the frontend never hand-writes an
 * `invoke` string or argument shape. Arg keys are camelCase; Tauri maps them to
 * the snake_case Rust params automatically.
 */
import { invoke } from "@tauri-apps/api/core";

import type {
  BranchRef,
  Comment,
  CommitInfo,
  Diff,
  DiffKind,
  DiffSummary,
  Hunk,
  RecentRepo,
  RepoInfo,
  TagRef,
  WorktreeInfo,
} from "./types";

/** Validate + open a repo, recording it in the recent list. */
export function openRepo(repoPath: string): Promise<RepoInfo> {
  return invoke<RepoInfo>("open_repo", { repoPath });
}

/** The most-recently-opened repositories. */
export function recentRepos(limit = 12): Promise<RecentRepo[]> {
  return invoke<RecentRepo[]>("recent_repos", { limit });
}

/** Local + remote branches (current flagged). */
export function branches(repoPath: string): Promise<BranchRef[]> {
  return invoke<BranchRef[]>("branches", { repoPath });
}

/** All tags. */
export function tags(repoPath: string): Promise<TagRef[]> {
  return invoke<TagRef[]>("tags", { repoPath });
}

/** All worktrees, including the main one. */
export function worktrees(repoPath: string): Promise<WorktreeInfo[]> {
  return invoke<WorktreeInfo[]>("worktrees", { repoPath });
}

/** The commit log reachable from `rev`, newest first, paginated. */
export function commits(
  repoPath: string,
  rev: string,
  limit = 50,
  offset = 0,
): Promise<CommitInfo[]> {
  return invoke<CommitInfo[]>("commits", { repoPath, rev, limit, offset });
}

/** Resolve (creating if needed) the stable diff id for a comparison. */
export function computeDiff(
  repoPath: string,
  left: string,
  right: string,
  kind: DiffKind = "ref-to-ref",
): Promise<Diff> {
  return invoke<Diff>("compute_diff", { repoPath, left, right, kind });
}

/** The file-level summary of a diff between two refs (no persistence). */
export function diffSummary(repoPath: string, left: string, right: string): Promise<DiffSummary> {
  return invoke<DiffSummary>("diff_summary", { repoPath, left, right });
}

/** Look up a persisted diff by id (for the `ugit open` deep-link handoff). */
export function getDiff(id: string): Promise<Diff> {
  return invoke<Diff>("get_diff", { id });
}

/** Line-level hunks for a single file (lazy, per-file). */
export function fileHunks(
  repoPath: string,
  left: string,
  right: string,
  path: string,
  oldPath?: string | null,
): Promise<Hunk[]> {
  return invoke<Hunk[]>("file_hunks", { repoPath, left, right, path, oldPath: oldPath ?? null });
}

/** A blob's text at a ref — the before/after sides for the diff renderer. */
export function fileContent(repoPath: string, rev: string, path: string): Promise<string | null> {
  return invoke<string | null>("file_content", { repoPath, rev, path });
}

/** All comments on a diff — the same data `ugit comment <diff-id>` exports. */
export function listComments(diffId: string): Promise<Comment[]> {
  return invoke<Comment[]>("list_comments", { diffId });
}

/** Attach a comment to a diff. */
export function addComment(args: {
  diffId: string;
  body: string;
  filePath?: string | null;
  line?: number | null;
  side?: "left" | "right" | null;
  lineContent?: string | null;
}): Promise<Comment> {
  return invoke<Comment>("add_comment", {
    diffId: args.diffId,
    body: args.body,
    filePath: args.filePath ?? null,
    line: args.line ?? null,
    side: args.side ?? null,
    lineContent: args.lineContent ?? null,
  });
}

/** Edit a comment's body. */
export function updateComment(id: string, body: string): Promise<Comment> {
  return invoke<Comment>("update_comment", { id, body });
}

/** Delete a comment. */
export function deleteComment(id: string): Promise<void> {
  return invoke<void>("delete_comment", { id });
}
