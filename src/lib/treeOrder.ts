/**
 * Order changed files the way the sidebar tree renders them — directories
 * grouped first, then a case-insensitive natural sort — so the diff view,
 * j/k navigation and jump-to-file all line up with what the tree shows.
 *
 * `prepareFileTreeInput` is the same routine `@pierre/trees` uses internally to
 * sort paths, so reusing it here keeps the two surfaces from drifting (the diff
 * is sorted by full path otherwise, which puts `src/App.tsx` before
 * `src/components/…` even though the tree shows the folder first).
 */
import { prepareFileTreeInput } from "@pierre/trees";

import type { FileChange } from "./types";

export function sortFilesByTreeOrder(files: FileChange[]): FileChange[] {
  if (files.length <= 1) return files;
  const byPath = new Map(files.map((f) => [f.path, f]));
  const ordered: FileChange[] = [];
  for (const path of prepareFileTreeInput(files.map((f) => f.path)).paths) {
    const f = byPath.get(path);
    if (f) {
      ordered.push(f);
      byPath.delete(path);
    }
  }
  // Defensive: keep any path the prepare step didn't echo back.
  for (const f of byPath.values()) ordered.push(f);
  return ordered;
}
