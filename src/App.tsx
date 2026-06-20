import { useState } from "react";

import { FileList } from "./components/FileList";
import { EmptyState, ErrorState, Skeleton } from "./components/states";
import { ThemeControls } from "./components/ThemeControls";
import { diffSummary } from "./lib/ipc";
import type { DiffSummary } from "./lib/types";

type Status = "idle" | "loading" | "ready" | "error";

function App() {
  const [repoPath, setRepoPath] = useState("");
  const [left, setLeft] = useState("HEAD^");
  const [right, setRight] = useState("HEAD");

  const [status, setStatus] = useState<Status>("idle");
  const [summary, setSummary] = useState<DiffSummary | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  async function runDiff() {
    if (!repoPath.trim()) return;
    setStatus("loading");
    setError("");
    setSelected(null);
    try {
      const result = await diffSummary(repoPath.trim(), left.trim(), right.trim());
      setSummary(result);
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
          {status === "ready" && summary && summary.files.length > 0 && (
            <FileList files={summary.files} selected={selected} onSelect={setSelected} />
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

        <main className="min-w-0 flex-1 overflow-auto">
          {selectedFile ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 border-b border-line px-4 py-2">
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
              </div>
              <div className="flex-1">
                <EmptyState
                  title="Diff view coming next"
                  hint="The file-level summary is live. Line-level hunks (Epic 1, cut 2) and the diffs.com renderer (Epic 4) fill this pane."
                />
              </div>
            </div>
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
        <span className="ml-auto text-faint">⌘K — coming soon</span>
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
