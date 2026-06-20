/**
 * Typed wrappers around the Tauri commands defined in `src-tauri/src/lib.rs`.
 *
 * Every backend call goes through here so the frontend never hand-writes an
 * `invoke` string or argument shape. Arg keys are camelCase; Tauri maps them to
 * the snake_case Rust params automatically.
 */
import { invoke } from "@tauri-apps/api/core";

import type { Comment, Diff, DiffKind, DiffSummary } from "./types";

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
  side?: string | null;
}): Promise<Comment> {
  return invoke<Comment>("add_comment", {
    diffId: args.diffId,
    body: args.body,
    filePath: args.filePath ?? null,
    line: args.line ?? null,
    side: args.side ?? null,
  });
}
