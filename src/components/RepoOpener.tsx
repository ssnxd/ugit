/** The start screen: open a repository via the native folder picker, or pick
 *  one from the recently-opened list. */
import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { openRepo, recentRepos } from "../lib/ipc";
import type { RecentRepo, RepoInfo } from "../lib/types";

export function RepoOpener({ onOpen }: { onOpen: (repo: RepoInfo) => void }) {
  const [recents, setRecents] = useState<RecentRepo[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    recentRepos()
      .then(setRecents)
      .catch(() => setRecents([]));
  }, []);

  async function openPath(path: string) {
    setError("");
    try {
      onOpen(await openRepo(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pickFolder() {
    setError("");
    try {
      const dir = await openDialog({
        directory: true,
        multiple: false,
        title: "Open a git repository",
      });
      if (typeof dir === "string") await openPath(dir);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="flex flex-col items-center gap-1.5">
        <span className="font-mono text-xl font-semibold tracking-tight text-ink">ugit</span>
        <p className="text-sm text-muted">Open a repository to start diffing.</p>
      </div>

      <button
        type="button"
        onClick={pickFolder}
        className="ease-out-quint rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
      >
        Open folder…
      </button>

      {recents.length > 0 && (
        <div className="w-full max-w-md">
          <p className="mb-1.5 px-1 text-xs font-medium tracking-wide text-faint">RECENT</p>
          <ul className="overflow-hidden rounded-md border border-line">
            {recents.map((r) => (
              <li key={r.path}>
                <button
                  type="button"
                  onClick={() => openPath(r.path)}
                  className="ease-out-quint flex w-full items-baseline gap-2 border-b border-line px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface"
                >
                  <span className="shrink-0 font-mono text-sm text-ink">{r.name}</span>
                  <span className="truncate font-mono text-xs text-faint">{r.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="max-w-md text-center font-mono text-xs text-[var(--ug-diff-del-line)]">
          {error}
        </p>
      )}
    </div>
  );
}
