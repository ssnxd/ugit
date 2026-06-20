/**
 * Renders the selected file's diff with `@pierre/diffs`, GitHub-style: hover a
 * line to reveal a "+" in the gutter, click it to comment on that exact change,
 * and existing comments render inline as threads anchored to their line. Diff
 * colors route through our colorblind-safe tokens (see styles.css).
 */
import { useEffect, useMemo, useState } from "react";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { AnnotationSide, DiffLineAnnotation } from "@pierre/diffs";

import { EmptyState, ErrorState, Skeleton } from "../components/states";
import { fileContent } from "../lib/ipc";
import type { Comment, FileChange } from "../lib/types";
import { useWorkerReady } from "./DiffWorkerProvider";

type Side = "left" | "right";
type Anchor = { line: number; side: Side };
type Anno =
  | { kind: "thread"; anchor: Anchor; comments: Comment[] }
  | { kind: "draft"; anchor: Anchor };

const toDiffsSide = (s: Side): AnnotationSide => (s === "right" ? "additions" : "deletions");
const fromDiffsSide = (s: AnnotationSide): Side => (s === "additions" ? "right" : "left");

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
  comments,
  onAdd,
  onEdit,
  onDelete,
}: {
  repoPath: string;
  left: string;
  right: string;
  file: FileChange;
  diffStyle: "split" | "unified";
  comments: Comment[];
  onAdd: (args: { filePath: string; line: number; side: Side; body: string }) => void;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [draft, setDraft] = useState<Anchor | null>(null);
  const oldPath = file.oldPath ?? file.path;
  const workerReady = useWorkerReady();

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

  // Reset any open draft when the file changes.
  useEffect(() => setDraft(null), [file.path]);

  // Group this file's anchored comments into one thread per (line, side), plus
  // the open draft, as diffs.com line annotations.
  const lineAnnotations = useMemo<DiffLineAnnotation<Anno>[]>(() => {
    const threads = new Map<string, { anchor: Anchor; comments: Comment[] }>();
    for (const c of comments) {
      if (c.filePath !== file.path || c.line == null) continue;
      const side: Side = c.side === "left" ? "left" : "right";
      const key = `${side}:${c.line}`;
      const entry = threads.get(key) ?? { anchor: { line: c.line, side }, comments: [] };
      entry.comments.push(c);
      threads.set(key, entry);
    }
    const out: DiffLineAnnotation<Anno>[] = [];
    for (const { anchor, comments: cs } of threads.values()) {
      out.push({
        side: toDiffsSide(anchor.side),
        lineNumber: anchor.line,
        metadata: { kind: "thread", anchor, comments: cs },
      });
    }
    if (draft) {
      out.push({
        side: toDiffsSide(draft.side),
        lineNumber: draft.line,
        metadata: { kind: "draft", anchor: draft },
      });
    }
    return out;
  }, [comments, file.path, draft]);

  if (file.binary) {
    return <EmptyState title="Binary file" hint={`${file.path} — no text diff to show.`} />;
  }
  if (load.status === "loading" || !workerReady) {
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
    <MultiFileDiff<Anno>
      key={file.path}
      oldFile={{ name: oldPath, contents: load.oldContents }}
      newFile={{ name: file.path, contents: load.newContents }}
      options={{ disableFileHeader: true, diffStyle }}
      className="ugit-diff"
      lineAnnotations={lineAnnotations}
      renderGutterUtility={(getHoveredLine) => (
        <button
          type="button"
          title="Comment on this line"
          onClick={() => {
            const hovered = getHoveredLine();
            if (hovered) setDraft({ line: hovered.lineNumber, side: fromDiffsSide(hovered.side) });
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "18px",
            height: "18px",
            borderRadius: "var(--radius-sm)",
            background: "var(--ug-accent)",
            color: "var(--ug-accent-ink)",
            fontSize: "13px",
            lineHeight: 1,
            border: "none",
            cursor: "pointer",
          }}
        >
          +
        </button>
      )}
      renderAnnotation={(ann) =>
        ann.metadata.kind === "draft" ? (
          <InlineComposer
            onSubmit={(body) => {
              onAdd({
                filePath: file.path,
                line: ann.metadata.anchor.line,
                side: ann.metadata.anchor.side,
                body,
              });
              setDraft(null);
            }}
            onCancel={() => setDraft(null)}
          />
        ) : (
          <InlineThread
            comments={ann.metadata.comments}
            onReply={(body) =>
              onAdd({
                filePath: file.path,
                line: ann.metadata.anchor.line,
                side: ann.metadata.anchor.side,
                body,
              })
            }
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      }
    />
  );
}

/** Shared visual shell for inline comment UI (styled with CSS vars so it reads
 *  correctly wherever the renderer mounts the annotation). */
const cardStyle: React.CSSProperties = {
  margin: "4px 8px",
  border: "1px solid var(--ug-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--ug-surface)",
  fontFamily: "var(--font-sans)",
  fontSize: "13px",
  color: "var(--ug-ink)",
  overflow: "hidden",
};
const textareaStyle: React.CSSProperties = {
  width: "100%",
  resize: "none",
  border: "1px solid var(--ug-border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--ug-bg)",
  color: "var(--ug-ink)",
  font: "inherit",
  padding: "6px 8px",
  outline: "none",
};
const primaryBtn: React.CSSProperties = {
  background: "var(--ug-accent)",
  color: "var(--ug-accent-ink)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  padding: "3px 10px",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--ug-muted)",
  border: "none",
  padding: "3px 6px",
  fontSize: "12px",
  cursor: "pointer",
};

function InlineComposer({
  onSubmit,
  onCancel,
  initial = "",
  autoFocus = true,
}: {
  onSubmit: (body: string) => void;
  onCancel: () => void;
  initial?: string;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState(initial);
  return (
    <div style={{ ...cardStyle, padding: "8px" }}>
      <textarea
        autoFocus={autoFocus}
        rows={3}
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (body.trim()) onSubmit(body.trim());
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Comment on this line…  (⌘↵ to send)"
        style={textareaStyle}
      />
      <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
        <button
          type="button"
          style={primaryBtn}
          onClick={() => body.trim() && onSubmit(body.trim())}
        >
          Comment
        </button>
        <button type="button" style={ghostBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function InlineThread({
  comments,
  onReply,
  onEdit,
  onDelete,
}: {
  comments: Comment[];
  onReply: (body: string) => void;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div style={cardStyle}>
      {comments.map((c, i) => (
        <div
          key={c.id}
          style={{
            padding: "8px",
            borderTop: i === 0 ? "none" : "1px solid var(--ug-border)",
          }}
        >
          {editingId === c.id ? (
            <InlineComposer
              initial={c.body}
              onSubmit={(body) => {
                onEdit(c.id, body);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{c.body}</div>
              <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                <button
                  type="button"
                  style={{ ...ghostBtn, padding: 0, fontSize: "11px" }}
                  onClick={() => setEditingId(c.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  style={{ ...ghostBtn, padding: 0, fontSize: "11px" }}
                  onClick={() => onDelete(c.id)}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      ))}
      <div style={{ padding: "6px 8px", borderTop: "1px solid var(--ug-border)" }}>
        {replying ? (
          <InlineComposer
            onSubmit={(body) => {
              onReply(body);
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
          />
        ) : (
          <button
            type="button"
            style={{ ...ghostBtn, padding: 0 }}
            onClick={() => setReplying(true)}
          >
            Reply
          </button>
        )}
      </div>
    </div>
  );
}
