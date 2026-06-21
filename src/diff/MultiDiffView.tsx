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

/** Fast non-cryptographic hash (cyrb53) of the patch, used only to derive a
 *  stable, content-unique highlight cache prefix. */
function hashPatch(str: string): string {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

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

  // Scroll-spy ↔ scroll-to would otherwise fight: a j/k or tree click scrolls
  // the file to the top, the scroll fires onScroll, and the spy snaps `selected`
  // to a neighbour when the target can't reach the very top (bottom clamp /
  // sticky-header offset). We let one writer win at a time — while a
  // programmatic scroll is settling, the spy is muted.
  const programmaticRef = useRef(false);
  const muteTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);

  // Content-addressed prefix so every parsed file gets a stable `cacheKey`.
  // Without it `processPatch` leaves `cacheKey` undefined, which silently
  // disables BOTH highlight priming and result caching — so every file
  // re-highlights from scratch as it scrolls in (the plain-text flash). Keying
  // on the patch content means a different diff can't collide with stale
  // highlights, and re-opening the same diff reuses them.
  const cacheKeyPrefix = useMemo(() => `ugit-${hashPatch(patch)}`, [patch]);

  const files = useMemo<FileDiffMetadata[]>(() => {
    if (!patch.trim()) return [];
    try {
      const parsedFiles = processPatch(patch, cacheKeyPrefix).files;
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
  }, [orderedPaths, patch, cacheKeyPrefix]);

  // Reset any open draft when the underlying diff changes.
  useEffect(() => setDraft(null), [patch]);

  // Prime the highlighter for every file once the pool is ready, so highlighting
  // is cached before a file scrolls into view (no plain-text flash).
  useEffect(() => {
    if (!ready || !pool) return;
    for (const f of files) pool.primeDiffHighlightCache(f);
  }, [files, ready, pool]);

  // Scroll to the selected file (tree click / j-k) — instant, no remount. Mute
  // the scroll-spy for a beat so the resulting scroll can't bounce `selected`.
  useEffect(() => {
    if (!scrollToPath) return;
    programmaticRef.current = true;
    if (muteTimerRef.current != null) clearTimeout(muteTimerRef.current);
    muteTimerRef.current = window.setTimeout(() => {
      programmaticRef.current = false;
      muteTimerRef.current = null;
    }, 150);
    viewRef.current?.scrollTo({
      type: "item",
      id: scrollToPath,
      align: "start",
      behavior: "instant",
    });
  }, [scrollToPath, scrollToKey, ready]);

  useEffect(() => {
    return () => {
      if (muteTimerRef.current != null) clearTimeout(muteTimerRef.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Resolve the top-most visible file. Item tops are monotonic in file order, so
  // binary-search for the last file at or above the viewport top — O(log n) per
  // frame instead of scanning every file.
  const emitActivePath = useCallback(
    (scrollTop: number, viewer: ScrollViewer) => {
      if (files.length === 0) return;
      const threshold = scrollTop + 1;
      let lo = 0;
      let hi = files.length - 1;
      let found = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const top = viewer.getTopForItem(files[mid].name);
        if (top != null && top <= threshold) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      onActivePathChange(files[found].name);
    },
    [files, onActivePathChange],
  );

  // Raw scroll events fire faster than we need; coalesce to one spy pass per
  // frame, and stay quiet while a programmatic scroll is settling.
  const handleScroll = useCallback(
    (scrollTop: number, viewer: ScrollViewer) => {
      if (programmaticRef.current) return;
      lastScrollTopRef.current = scrollTop;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        emitActivePath(lastScrollTopRef.current, viewer);
      });
    },
    [emitActivePath],
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
