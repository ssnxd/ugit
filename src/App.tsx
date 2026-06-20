import { useEffect, useState } from "react";

import { FileTreeSidebar } from "./components/FileTreeSidebar";
import { EmptyState, ErrorState, Skeleton } from "./components/states";
import { ThemeControls } from "./components/ThemeControls";
import { DiffView } from "./diff/DiffView";
import { diffSummary } from "./lib/ipc";
import { useTheme } from "./theme/theme";
import type { DiffSummary } from "./lib/types";

type Status = "idle" | "loading" | "ready" | "error";
/** The refs that produced the current summary — frozen so editing the inputs
 *  afterwards doesn't desync the rendered diff. */
type ActiveDiff = { repoPath: string; left: string; right: string };

function App() {
  const [repoPath, setRepoPath] = useState("");
  const [left, setLeft] = useState("HEAD^");
  const [right, setRight] = useState("HEAD");

  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [active, setActive] = useState<ActiveDiff | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { diffStyle, setDiffStyle } = useTheme();

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
    const params = { repoPath: repoPath.trim(), left: left.trim(), right: right.trim() };
    if (!params.repoPath) return;
    setStatus("loading");
    setError("");
    setSelected(null);
    try {
      const result = await diffSummary(params.repoPath, params.left, params.right);
      setSummary(result);
      setActive(params);
      setStatus("ready");
      setSelected(result.files[0]?.path ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  const selectedFile = summary?.files.find((f) => f.path === selected) ?? null;

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      {/* Top bar */}
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <span className="font-mono text-md font-semibold tracking-tight text-ink">ugit</span>
        <form
          className="flex flex-1 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            runDiff();
          }}
        >
          <RefInput value={repoPath} onChange={setRepoPath} placeholder="/path/to/repo" grow />
          <RefInput value={left} onChange={setLeft} placeholder="left" />
          <span className="font-mono text-xs text-faint">→</span>
          <RefInput value={right} onChange={setRight} placeholder="right" />
          <button
            type="submit"
            disabled={!repoPath.trim() || status === "loading"}
            className="ease-out-quint rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Diff
          </button>
        </form>
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
              hint="Enter a repo path and two refs above, then hit Diff."
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

function RefInput({
  value,
  onChange,
  placeholder,
  grow = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  grow?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      spellCheck={false}
      onChange={(e) => onChange(e.currentTarget.value)}
      placeholder={placeholder}
      className={`ease-out-quint h-7 rounded-md border border-line bg-bg px-2 font-mono text-xs text-ink transition-colors placeholder:text-faint focus:border-line-strong ${
        grow ? "min-w-0 flex-1" : "w-28"
      }`}
    />
  );
}

export default App;
