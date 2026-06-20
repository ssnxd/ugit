/**
 * The sidebar file tree, rendered with `@pierre/trees`. Built from the diff's
 * changed paths, colored by git status, with per-file +/− counts as a row
 * decoration. Selection is two-way bound to the app (tree → app via
 * onSelectionChange, app → tree via the model in an effect, so keyboard nav in
 * App stays in sync). Theming comes from the `--trees-*` → `--ug-*` mapping in
 * styles.css; the tree auto-injects its own base styles.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type {
  FileTreeRowDecoration,
  FileTreeRowDecorationContext,
  GitStatus,
  GitStatusEntry,
} from "@pierre/trees";

import type { FileChange, FileStatus } from "../lib/types";

const STATUS_MAP: Record<FileStatus, GitStatus> = {
  added: "added",
  deleted: "deleted",
  modified: "modified",
  renamed: "renamed",
  copied: "added",
};

export function FileTreeSidebar({
  files,
  selected,
  onSelect,
}: {
  files: FileChange[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const paths = useMemo(() => files.map((f) => f.path), [files]);
  const gitStatus = useMemo<GitStatusEntry[]>(
    () => files.map((f) => ({ path: f.path, status: STATUS_MAP[f.status] })),
    [files],
  );
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);

  // Refs let the tree callbacks stay stable (so the model isn't rebuilt) while
  // still reading the latest props.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const byPathRef = useRef(byPath);
  byPathRef.current = byPath;

  const onSelectionChange = useCallback((sel: readonly string[]) => {
    const next = sel[0];
    if (next && next !== selectedRef.current) onSelectRef.current(next);
  }, []);

  const renderRowDecoration = useCallback(
    ({ row }: FileTreeRowDecorationContext): FileTreeRowDecoration | null => {
      if (row.kind !== "file") return null;
      const f = byPathRef.current.get(row.path);
      if (!f || f.binary) return null;
      return {
        text: `+${f.additions} −${f.deletions}`,
        title: `${f.additions} added, ${f.deletions} removed`,
      };
    },
    [],
  );

  const { model } = useFileTree({
    paths,
    gitStatus,
    density: "compact",
    initialExpansion: "open",
    initialSelectedPaths: selected ? [selected] : [],
    onSelectionChange,
    renderRowDecoration,
  });

  // Reflect app-driven selection (e.g. keyboard nav) into the tree.
  useEffect(() => {
    if (!selected) return;
    const item = model.getItem(selected);
    if (item && !item.isSelected()) item.select();
    model.scrollToPath(selected, { offset: "nearest" });
  }, [model, selected]);

  return <FileTree model={model} className="ugit-tree h-full w-full" />;
}
