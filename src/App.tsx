import { useCallback, useEffect, useState } from "react";

import { CommentsPanel } from "./components/CommentsPanel";
import { FileTreeSidebar } from "./components/FileTreeSidebar";
import { RefPicker } from "./components/RefPicker";
import { RepoOpener } from "./components/RepoOpener";
import { EmptyState, ErrorState, Skeleton } from "./components/states";
import { ThemeControls } from "./components/ThemeControls";
import { DiffView } from "./diff/DiffView";
import {
  addComment,
  computeDiff,
  deleteComment,
  diffSummary,
  listComments,
  updateComment,
} from "./lib/ipc";
import { useTheme } from "./theme/theme";
import type { Comment, DiffSummary, RepoInfo } from "./lib/types";

type Status = "idle" | "loading" | "ready" | "error";
/** The refs that produced the current summary — frozen so changing the pickers
 *  afterwards doesn't desync the rendered diff. */
type ActiveDiff = { repoPath: string; left: string; right: string };

function App() {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [left, setLeft] = useState("HEAD^");
  const [right, setRight] = useState("HEAD");

  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [active, setActive] = useState<ActiveDiff | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const [diffId, setDiffId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const { diffStyle, setDiffStyle } = useTheme();

  const loadComments = useCallback(async (id: string) => {
    try {
      setComments(await listComments(id));
    } catch {
      setComments([]);
    }
  }, []);

  // Keyboard nav: j/k move between changed files (ignored while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      const files = summary?.files ?? [];
      if (files.length === 0 || (e.key !== "j" && e.key !== "k")) return;
      e.preventDefault();
      const i = files.findIndex((f) => f.path === selected);
      const base = i === -1 ? 0 : i;
      const next = e.key === "j" ? Math.min(files.length - 1, base + 1) : Math.max(0, base - 1);
      setSelected(files[next]?.path ?? null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [summary, selected]);

  async function runDiff() {
    if (!repo) return;
    const params = { repoPath: repo.path, left: left.trim(), right: right.trim() };
    setStatus("loading");
    setError("");
    setSelected(null);
    setComments([]);
    setDiffId(null);
    try {
      const [result, diff] = await Promise.all([
        diffSummary(params.repoPath, params.left, params.right),
        computeDiff(params.repoPath, params.left, params.right),
      ]);
      setSummary(result);
      setActive(params);
      setStatus("ready");
      setSelected(result.files[0]?.path ?? null);
      setDiffId(diff.id);
      loadComments(diff.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  async function addCommentTo(body: string, filePath: string | null) {
    if (!diffId) return;
    await addComment({ diffId, body, filePath });
    loadComments(diffId);
  }
  async function addInline(args: {
    filePath: string;
    line: number;
    side: "left" | "right";
    body: string;
  }) {
    if (!diffId) return;
    await addComment({ diffId, ...args });
    loadComments(diffId);
  }
  async function editComment(id: string, body: string) {
    await updateComment(id, body);
    if (diffId) loadComments(diffId);
  }
  async function removeComment(id: string) {
    await deleteComment(id);
    if (diffId) loadComments(diffId);
  }

  function closeRepo() {
    setRepo(null);
    setStatus("idle");
    setSummary(null);
    setActive(null);
    setSelected(null);
    setError("");
    setDiffId(null);
    setComments([]);
    setCommentsOpen(false);
  }

  const selectedFile = summary?.files.find((f) => f.path === selected) ?? null;

  // No repo open yet → the start screen (with a minimal themed top bar).
  if (!repo) {
    return (
      <div className="flex h-full flex-col bg-bg text-ink">
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-surface px-3">
          <span className="font-mono text-md font-semibold tracking-tight text-ink">ugit</span>
          <ThemeControls />
        </header>
        <div className="min-h-0 flex-1">
          <RepoOpener onOpen={setRepo} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      {/* Top bar */}
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <span className="font-mono text-md font-semibold tracking-tight text-ink">ugit</span>
        <button
          type="button"
          onClick={closeRepo}
          title="Open a different repository"
          className="ease-out-quint flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-xs text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <span className="text-ink">{repo.name}</span>
          {repo.head && <span className="text-faint">@ {repo.head}</span>}
        </button>
        <div className="flex flex-1 items-center gap-1.5">
          <RefPicker repoPath={repo.path} value={left} onChange={setLeft} label="left" />
          <span className="font-mono text-xs text-faint">→</span>
          <RefPicker repoPath={repo.path} value={right} onChange={setRight} label="right" />
          <button
            type="button"
            onClick={runDiff}
            disabled={status === "loading"}
            className="ease-out-quint rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Diff
          </button>
        </div>
        {diffId && (
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            title="Toggle comments"
            className={`ease-out-quint rounded-md border px-2 py-1 text-xs transition-colors ${
              commentsOpen
                ? "border-accent/40 bg-accent/15 text-ink"
                : "border-line bg-surface text-muted hover:bg-raised hover:text-ink"
            }`}
          >
            Comments{comments.length > 0 ? ` ${comments.length}` : ""}
          </button>
        )}
        <ThemeControls />
      </header>

      {/* Body: sidebar + main */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-line bg-surface">
          {status === "loading" && (
            <div className="flex flex-col gap-1.5 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          )}
          {status === "ready" && summary && summary.files.length > 0 && active && (
            <FileTreeSidebar
              key={`${active.repoPath}:${active.left}:${active.right}`}
              files={summary.files}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {status === "ready" && summary && summary.files.length === 0 && (
            <EmptyState title="No changes" hint="These two refs point at identical trees." />
          )}
          {status === "idle" && (
            <EmptyState
              title="Pick something to diff"
              hint="Choose two refs above, then hit Diff."
            />
          )}
          {status === "error" && <ErrorState message={error} onRetry={runDiff} />}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedFile && active ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-line bg-bg px-4 py-2">
                <span className="truncate font-mono text-sm text-ink">{selectedFile.path}</span>
                {!selectedFile.binary && (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                    <span className="text-[var(--ug-diff-add-line)]">
                      +{selectedFile.additions}
                    </span>{" "}
                    <span className="text-[var(--ug-diff-del-line)]">
                      −{selectedFile.deletions}
                    </span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setDiffStyle(diffStyle === "split" ? "unified" : "split")}
                  className="ease-out-quint ml-auto shrink-0 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted transition-colors hover:bg-raised hover:text-ink"
                  title="Toggle split / unified diff layout"
                >
                  {diffStyle === "split" ? "Split" : "Unified"}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <DiffView
                  repoPath={active.repoPath}
                  left={active.left}
                  right={active.right}
                  file={selectedFile}
                  diffStyle={diffStyle}
                  comments={comments}
                  onAdd={addInline}
                  onEdit={editComment}
                  onDelete={removeComment}
                />
              </div>
            </>
          ) : (
            <EmptyState
              title="ugit"
              hint="A diff-focused git client. Choose two refs to compare; changed files show on the left."
            />
          )}
        </main>

        {commentsOpen && diffId && (
          <CommentsPanel
            comments={comments}
            selectedFile={selected}
            onAdd={addCommentTo}
            onEdit={editComment}
            onDelete={removeComment}
            onClose={() => setCommentsOpen(false)}
          />
        )}
      </div>

      {/* Status bar */}
      <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-surface px-3 font-mono text-xs text-muted">
        {status === "ready" && summary ? (
          <>
            <span className="text-faint">
              {left || "—"} → {right || "—"}
            </span>
            <span>
              <span className="text-[var(--ug-diff-add-line)]">+{summary.totalAdditions}</span>{" "}
              <span className="text-[var(--ug-diff-del-line)]">−{summary.totalDeletions}</span>
            </span>
            <span>
              {summary.files.length} file{summary.files.length === 1 ? "" : "s"}
            </span>
          </>
        ) : (
          <span className="text-faint">ready</span>
        )}
        <span className="ml-auto text-faint">j/k — files · ⌘K — coming soon</span>
      </footer>
    </div>
  );
}

export default App;
