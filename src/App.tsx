import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";

import { CommandPalette, type PaletteAction } from "./components/CommandPalette";
import { CommentsPanel } from "./components/CommentsPanel";
import { FileTreeSidebar } from "./components/FileTreeSidebar";
import { JumpToFile } from "./components/JumpToFile";
import { RefPicker } from "./components/RefPicker";
import { RepoOpener } from "./components/RepoOpener";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { EmptyState, ErrorState, Skeleton } from "./components/states";
import { DiffWorkerProvider } from "./diff/DiffWorkerProvider";
import { MultiDiffView } from "./diff/MultiDiffView";
import {
  addComment,
  computeDiff,
  deleteComment,
  diffSummary,
  getDiff,
  listComments,
  openRepo,
  unifiedDiff,
  updateComment,
} from "./lib/ipc";
import { useTheme } from "./theme/theme";
import type { Comment, DiffSummary, RepoInfo } from "./lib/types";

type Status = "idle" | "loading" | "ready" | "error";
/** The refs that produced the current summary — frozen so changing the pickers
 *  afterwards doesn't desync the rendered diff. */
type ActiveDiff = { repoPath: string; left: string; right: string };
type ScrollRequest = { path: string; key: number };

function App() {
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [left, setLeft] = useState("HEAD^");
  const [right, setRight] = useState("HEAD");

  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [active, setActive] = useState<ActiveDiff | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);

  const [diffId, setDiffId] = useState<string | null>(null);
  const [patch, setPatch] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const { diffStyle, setDiffStyle, diffColors, setDiffColors } = useTheme();

  // Guards against out-of-order async results: each diff run takes a sequence
  // number; `diffIdRef` mirrors the active diff so a late comment fetch for a
  // previous diff can't overwrite the current one.
  const runSeqRef = useRef(0);
  const diffIdRef = useRef<string | null>(null);

  const loadComments = useCallback(async (id: string) => {
    try {
      const result = await listComments(id);
      if (id === diffIdRef.current) setComments(result);
    } catch {
      if (id === diffIdRef.current) setComments([]);
    }
  }, []);

  const closeRepo = useCallback(() => {
    runSeqRef.current++; // cancel any in-flight diff run
    diffIdRef.current = null;
    setRepo(null);
    setStatus("idle");
    setSummary(null);
    setActive(null);
    setSelected(null);
    setScrollRequest(null);
    setError("");
    setDiffId(null);
    setPatch("");
    setComments([]);
    setCommentsOpen(false);
  }, []);

  const selectAndScrollToFile = useCallback((path: string) => {
    setSelected(path);
    setScrollRequest((prev) => ({ path, key: (prev?.key ?? 0) + 1 }));
  }, []);

  const syncSelectedFromScroll = useCallback((path: string) => {
    setSelected((current) => (current === path ? current : path));
  }, []);

  // Global keyboard shortcuts (ignored while typing). See ShortcutsOverlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ⌘K / Ctrl-K opens the command palette from anywhere (even inputs).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
        return;
      }
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
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowJump(false);
        return;
      }
      if (e.key === "o") {
        e.preventDefault();
        closeRepo();
        return;
      }
      if (e.key === "p" && status === "ready" && (summary?.files.length ?? 0) > 0) {
        e.preventDefault();
        setShowJump(true);
        return;
      }
      if (e.key === "c" && diffId) {
        e.preventDefault();
        setCommentsOpen((v) => !v);
        return;
      }
      if (e.key === "s" && status === "ready") {
        e.preventDefault();
        setDiffStyle(diffStyle === "split" ? "unified" : "split");
        return;
      }
      // j/k move between changed files.
      const files = summary?.files ?? [];
      if (files.length === 0 || (e.key !== "j" && e.key !== "k")) return;
      e.preventDefault();
      const i = files.findIndex((f) => f.path === selected);
      const base = i === -1 ? 0 : i;
      const next = e.key === "j" ? Math.min(files.length - 1, base + 1) : Math.max(0, base - 1);
      const nextPath = files[next]?.path;
      if (nextPath) selectAndScrollToFile(nextPath);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    summary,
    selected,
    diffId,
    status,
    diffStyle,
    setDiffStyle,
    closeRepo,
    selectAndScrollToFile,
  ]);

  const runDiffWith = useCallback(
    async (repoPath: string, l: string, r: string) => {
      const params = { repoPath, left: l.trim(), right: r.trim() };
      const seq = ++runSeqRef.current;
      diffIdRef.current = null;
      setStatus("loading");
      setError("");
      setSelected(null);
      setScrollRequest(null);
      setComments([]);
      setDiffId(null);
      setPatch("");
      try {
        // One round-trip: the tree summary, the stable diff-id, and the unified
        // patch (which the virtualized multi-file view renders) in parallel.
        const [result, diff, patchText] = await Promise.all([
          diffSummary(params.repoPath, params.left, params.right),
          computeDiff(params.repoPath, params.left, params.right),
          unifiedDiff(params.repoPath, params.left, params.right),
        ]);
        if (seq !== runSeqRef.current) return; // a newer run superseded this one
        setSummary(result);
        setActive(params);
        setPatch(patchText);
        setStatus("ready");
        const firstPath = result.files[0]?.path ?? null;
        setSelected(firstPath);
        setScrollRequest((prev) =>
          firstPath ? { path: firstPath, key: (prev?.key ?? 0) + 1 } : null,
        );
        diffIdRef.current = diff.id;
        setDiffId(diff.id);
        loadComments(diff.id);
      } catch (e) {
        if (seq !== runSeqRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    },
    [loadComments],
  );

  // The diff is always live: recompute whenever the repo or either ref changes.
  // No "Diff" button — picking a ref (or opening a repo) runs it automatically.
  useEffect(() => {
    if (repo) runDiffWith(repo.path, left, right);
  }, [repo, left, right, runDiffWith]);

  // `ugit open <diff-id>` deep link → restore that comparison in the GUI.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    async function handle(urls: string[] | null) {
      const url = urls?.find((u) => u.startsWith("ugit://"));
      const id = url?.match(/ugit:\/\/diff\/([^/?#]+)/)?.[1];
      if (!id) return;
      try {
        const diff = await getDiff(id);
        const info = await openRepo(diff.repoPath);
        // Setting these triggers the auto-run diff effect.
        setRepo(info);
        setLeft(diff.leftRef);
        setRight(diff.rightRef);
      } catch {
        /* unknown id or non-Tauri context — ignore */
      }
    }
    getCurrent()
      .then(handle)
      .catch(() => {});
    onOpenUrl((urls) => handle(urls))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [runDiffWith]);

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

  // Commands surfaced in the ⌘K palette, gated by current state.
  const paletteActions: PaletteAction[] = [];
  if (repo) {
    paletteActions.push({ id: "switch-repo", label: "Open / switch repository", run: closeRepo });
  }
  if (status === "ready" && (summary?.files.length ?? 0) > 0) {
    paletteActions.push({ id: "jump", label: "Jump to file…", run: () => setShowJump(true) });
  }
  if (diffId) {
    paletteActions.push({
      id: "comments",
      label: "Toggle comments",
      run: () => setCommentsOpen((v) => !v),
    });
  }
  if (status === "ready") {
    paletteActions.push({
      id: "layout",
      label: `Diff layout: ${diffStyle} → ${diffStyle === "split" ? "unified" : "split"}`,
      run: () => setDiffStyle(diffStyle === "split" ? "unified" : "split"),
    });
  }
  paletteActions.push({
    id: "diff-colors",
    label: `Diff colors: ${diffColors === "safe" ? "colorblind-safe" : "classic"} → ${diffColors === "safe" ? "classic" : "colorblind-safe"}`,
    run: () => setDiffColors(diffColors === "safe" ? "classic" : "safe"),
  });

  const palette = (
    <CommandPalette
      open={showPalette}
      onClose={() => setShowPalette(false)}
      actions={paletteActions}
    />
  );
  const paletteButton = (
    <button
      type="button"
      onClick={() => setShowPalette(true)}
      title="Command palette (⌘K)"
      className="ease-out-quint rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-muted transition-colors hover:bg-raised hover:text-ink"
    >
      ⌘K
    </button>
  );

  // No repo open yet → the start screen.
  if (!repo) {
    return (
      <div className="flex h-full flex-col bg-bg text-ink">
        <header className="flex h-10 shrink-0 items-center justify-between border-b border-line bg-surface px-3">
          <span className="font-mono text-md font-semibold tracking-tight text-ink">ugit</span>
          {paletteButton}
        </header>
        <div className="min-h-0 flex-1">
          <RepoOpener onOpen={setRepo} />
        </div>
        {showHelp && <ShortcutsOverlay onClose={() => setShowHelp(false)} />}
        {palette}
      </div>
    );
  }

  return (
    <DiffWorkerProvider>
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
            {status === "loading" && <span className="font-mono text-xs text-faint">diffing…</span>}
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
          {paletteButton}
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
                onSelect={selectAndScrollToFile}
              />
            )}
            {status === "ready" && summary && summary.files.length === 0 && (
              <EmptyState title="No changes" hint="These two refs point at identical trees." />
            )}
            {status === "idle" && (
              <EmptyState
                title="Pick something to diff"
                hint="Choose two refs above — the diff updates automatically."
              />
            )}
            {status === "error" && (
              <ErrorState message={error} onRetry={() => runDiffWith(repo.path, left, right)} />
            )}
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {status === "ready" && active ? (
              <MultiDiffView
                patch={patch}
                diffStyle={diffStyle}
                scrollToPath={scrollRequest?.path ?? null}
                scrollToKey={scrollRequest?.key ?? 0}
                orderedPaths={summary?.files.map((file) => file.path) ?? []}
                comments={comments}
                onActivePathChange={syncSelectedFromScroll}
                onAdd={addInline}
                onEdit={editComment}
                onDelete={removeComment}
              />
            ) : status === "loading" ? (
              <div className="flex flex-col gap-1.5 p-4">
                {Array.from({ length: 14 }).map((_, i) => (
                  <Skeleton key={i} className="h-4" style={{ width: `${40 + ((i * 53) % 55)}%` }} />
                ))}
              </div>
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
          <span className="ml-auto text-faint">⌘K commands · j/k files · ? shortcuts</span>
        </footer>

        {showHelp && <ShortcutsOverlay onClose={() => setShowHelp(false)} />}
        {showJump && summary && (
          <JumpToFile
            files={summary.files}
            onPick={selectAndScrollToFile}
            onClose={() => setShowJump(false)}
          />
        )}
        {palette}
      </div>
    </DiffWorkerProvider>
  );
}

export default App;
