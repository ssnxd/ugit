/**
 * Renders the selected file's diff with `@pierre/diffs`. We fetch each side's
 * contents from the core (`file_content`) and let the renderer compute + Shiki-
 * highlight the diff; diff colors are routed through our colorblind-safe tokens
 * (see the `--diffs-*-override` mapping in styles.css).
 */
import { useEffect, useState } from "react";
import { MultiFileDiff } from "@pierre/diffs/react";

import { EmptyState, ErrorState, Skeleton } from "../components/states";
import { fileContent } from "../lib/ipc";
import type { FileChange } from "../lib/types";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; oldContents: string; newContents: string };

export function DiffView({
  repoPath,
  left,
  right,
  file,
  diffStyle,
}: {
  repoPath: string;
  left: string;
  right: string;
  file: FileChange;
  diffStyle: "split" | "unified";
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const oldPath = file.oldPath ?? file.path;

  useEffect(() => {
    if (file.binary) return;
    let cancelled = false;
    setLoad({ status: "loading" });
    Promise.all([
      file.status === "added" ? Promise.resolve(null) : fileContent(repoPath, left, oldPath),
      file.status === "deleted" ? Promise.resolve(null) : fileContent(repoPath, right, file.path),
    ])
      .then(([oldC, newC]) => {
        if (cancelled) return;
        setLoad({ status: "ready", oldContents: oldC ?? "", newContents: newC ?? "" });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoad({ status: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, left, right, file.path, oldPath, file.status, file.binary]);

  if (file.binary) {
    return <EmptyState title="Binary file" hint={`${file.path} — no text diff to show.`} />;
  }
  if (load.status === "loading") {
    return (
      <div className="flex flex-col gap-1.5 p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${40 + ((i * 53) % 55)}%` }} />
        ))}
      </div>
    );
  }
  if (load.status === "error") {
    return <ErrorState message={load.message} />;
  }

  return (
    <MultiFileDiff
      key={file.path}
      oldFile={{ name: oldPath, contents: load.oldContents }}
      newFile={{ name: file.path, contents: load.newContents }}
      options={{ disableFileHeader: true, diffStyle }}
      className="ugit-diff"
    />
  );
}
