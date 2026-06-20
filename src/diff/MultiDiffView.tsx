/**
 * The diff surface: every changed file rendered in one *virtualized* `CodeView`,
 * fed by the core's unified patch (one IPC call). Selecting a file (tree or j/k)
 * scrolls to it — no remounts, snappy on large changesets. Syntax highlighting
 * is primed up-front so it doesn't flash plain-text. Comments anchor inline.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodeView, useWorkerPool, type CodeViewHandle } from "@pierre/diffs/react";
import { processPatch } from "@pierre/diffs";
import type {
  AnnotationSide,
  CodeViewDiffItem,
  DiffLineAnnotation,
  FileDiffMetadata,
} from "@pierre/diffs";

import { EmptyState, Skeleton } from "../components/states";
import type { Comment } from "../lib/types";
import { useWorkerReady } from "./DiffWorkerProvider";

type Side = "left" | "right";
type Anchor = { filePath: string; line: number; side: Side };
type ScrollViewer = { getTopForItem: (id: string) => number | undefined };
type Anno =
  | { kind: "thread"; anchor: Anchor; comments: Comment[] }
  | { kind: "draft"; anchor: Anchor };

const toDiffsSide = (s: Side): AnnotationSide => (s === "right" ? "additions" : "deletions");
const fromDiffsSide = (s: AnnotationSide): Side => (s === "additions" ? "right" : "left");

export function MultiDiffView({
  patch,
  diffStyle,
  scrollToPath,
  scrollToKey,
  orderedPaths,
  comments,
  onActivePathChange,
  onAdd,
  onEdit,
  onDelete,
}: {
  patch: string;
  diffStyle: "split" | "unified";
  scrollToPath: string | null;
  scrollToKey: number;
  orderedPaths: string[];
  comments: Comment[];
  onActivePathChange: (path: string) => void;
  onAdd: (args: { filePath: string; line: number; side: Side; body: string }) => void;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  const ready = useWorkerReady();
  const pool = useWorkerPool();
  const viewRef = useRef<CodeViewHandle<Anno>>(null);
  const [draft, setDraft] = useState<Anchor | null>(null);

  const files = useMemo<FileDiffMetadata[]>(() => {
    if (!patch.trim()) return [];
    try {
      const parsedFiles = processPatch(patch).files;
      const rank = new Map(orderedPaths.map((path, index) => [path, index]));
      return parsedFiles
        .map((file, index) => ({ file, index }))
        .sort((a, b) => {
          const aRank = rank.get(a.file.name) ?? Number.MAX_SAFE_INTEGER;
          const bRank = rank.get(b.file.name) ?? Number.MAX_SAFE_INTEGER;
          return aRank - bRank || a.index - b.index;
        })
        .map(({ file }) => file);
    } catch {
      return [];
    }
  }, [orderedPaths, patch]);

  // Reset any open draft when the underlying diff changes.
  useEffect(() => setDraft(null), [patch]);

  // Prime the highlighter for every file once the pool is ready, so highlighting
  // is cached before a file scrolls into view (no plain-text flash).
  useEffect(() => {
    if (!ready || !pool) return;
    for (const f of files) pool.primeDiffHighlightCache(f);
  }, [files, ready, pool]);

  // Scroll to the selected file (tree click / j-k) — instant, no remount.
  useEffect(() => {
    if (scrollToPath) {
      viewRef.current?.scrollTo({
        type: "item",
        id: scrollToPath,
        align: "start",
        behavior: "instant",
      });
    }
  }, [scrollToPath, scrollToKey, ready]);

  const handleScroll = useCallback(
    (scrollTop: number, viewer: ScrollViewer) => {
      let activePath: string | null = null;
      for (const f of files) {
        const top = viewer.getTopForItem(f.name);
        if (top == null || top > scrollTop + 1) break;
        activePath = f.name;
      }
      activePath ??= files[0]?.name ?? null;
      if (activePath) onActivePathChange(activePath);
    },
    [files, onActivePathChange],
  );

  const items = useMemo<CodeViewDiffItem<Anno>[]>(() => {
    return files.map((f) => {
      const threads = new Map<string, { anchor: Anchor; comments: Comment[] }>();
      for (const c of comments) {
        if (c.filePath !== f.name || c.line == null) continue;
        const side: Side = c.side === "left" ? "left" : "right";
        const key = `${side}:${c.line}`;
        const entry = threads.get(key) ?? {
          anchor: { filePath: f.name, line: c.line, side },
          comments: [],
        };
        entry.comments.push(c);
        threads.set(key, entry);
      }
      const annotations: DiffLineAnnotation<Anno>[] = [];
      for (const { anchor, comments: cs } of threads.values()) {
        annotations.push({
          side: toDiffsSide(anchor.side),
          lineNumber: anchor.line,
          metadata: { kind: "thread", anchor, comments: cs },
        });
      }
      if (draft && draft.filePath === f.name) {
        annotations.push({
          side: toDiffsSide(draft.side),
          lineNumber: draft.line,
          metadata: { kind: "draft", anchor: draft },
        });
      }
      return { id: f.name, type: "diff", fileDiff: f, annotations };
    });
  }, [files, comments, draft]);

  if (!ready) {
    return (
      <div className="flex flex-col gap-1.5 p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${40 + ((i * 53) % 55)}%` }} />
        ))}
      </div>
    );
  }
  if (files.length === 0) {
    return <EmptyState title="No changes" hint="These two refs point at identical trees." />;
  }

  return (
    <CodeView<Anno>
      ref={viewRef}
      items={items}
      className="ugit-diff min-h-0 flex-1 overflow-auto"
      options={{ diffStyle, enableGutterUtility: true }}
      onScroll={handleScroll}
      renderGutterUtility={(getHoveredLine, item) =>
        item.type === "diff" ? (
          <button
            type="button"
            title="Comment on this line"
            onClick={() => {
              const h = getHoveredLine();
              if (h && "side" in h && h.side) {
                setDraft({
                  filePath: item.fileDiff.name,
                  line: h.lineNumber,
                  side: fromDiffsSide(h.side as AnnotationSide),
                });
              }
            }}
            style={plusBtn}
          >
            +
          </button>
        ) : null
      }
      renderAnnotation={(annotation) => {
        const meta = annotation.metadata;
        if (!meta) return null;
        if (meta.kind === "draft") {
          const a = meta.anchor;
          return (
            <InlineComposer
              onSubmit={(body) => {
                onAdd({ filePath: a.filePath, line: a.line, side: a.side, body });
                setDraft(null);
              }}
              onCancel={() => setDraft(null)}
            />
          );
        }
        const a = meta.anchor;
        return (
          <InlineThread
            comments={meta.comments}
            onReply={(body) => onAdd({ filePath: a.filePath, line: a.line, side: a.side, body })}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        );
      }}
    />
  );
}

// --- inline comment UI (CSS-var inline styles so it reads inside the renderer) ---

const plusBtn: React.CSSProperties = {
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
};
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
}: {
  onSubmit: (body: string) => void;
  onCancel: () => void;
  initial?: string;
}) {
  const [body, setBody] = useState(initial);
  return (
    <div style={{ ...cardStyle, padding: "8px" }}>
      <textarea
        autoFocus
        rows={3}
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
            e.preventDefault();
            onSubmit(body.trim());
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Comment on this line…  (⌘↵ to send)"
        style={textareaStyle}
      />
      <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
        <button
          type="button"
          disabled={!body.trim()}
          style={{ ...primaryBtn, opacity: body.trim() ? 1 : 0.4 }}
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
          style={{ padding: "8px", borderTop: i === 0 ? "none" : "1px solid var(--ug-border)" }}
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
