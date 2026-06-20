/** A ref chooser: a button showing the current ref that opens a searchable
 *  popover of branches, tags, and recent commits. Selecting one sets the ref.
 *  Worktree-based diffing is deferred (we only diff tree-to-tree today). */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { branches, commits, tags } from "../lib/ipc";
import type { BranchRef, CommitInfo, TagRef } from "../lib/types";

type RefData = { branches: BranchRef[]; tags: TagRef[]; commits: CommitInfo[] };

export function RefPicker({
  repoPath,
  value,
  onChange,
  label,
}: {
  repoPath: string;
  value: string;
  onChange: (ref: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<RefData | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Load ref data once, on first open.
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    Promise.all([branches(repoPath), tags(repoPath), commits(repoPath, "HEAD", 30, 0)])
      .then(([b, t, c]) => {
        if (!cancelled) setData({ branches: b, tags: t, commits: c });
      })
      .catch(() => {
        if (!cancelled) setData({ branches: [], tags: [], commits: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, data, repoPath]);

  // Anchor the fixed popover under the trigger (fixed escapes overflow clipping).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) {
        const panel = document.getElementById("ref-picker-panel");
        if (!panel?.contains(e.target as Node)) setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(ref: string) {
    onChange(ref);
    setOpen(false);
    setQuery("");
  }

  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);
  const filtered = data && {
    branches: data.branches.filter((b) => match(b.name)),
    tags: data.tags.filter((t) => match(t.name)),
    commits: data.commits.filter((c) => match(c.summary) || match(c.shortId)),
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${label}: ${value}`}
        className="ease-out-quint flex h-7 max-w-44 items-center gap-1.5 rounded-md border border-line bg-bg px-2 font-mono text-xs text-ink transition-colors hover:border-line-strong"
      >
        <span className="truncate">{value || label}</span>
        <span className="shrink-0 text-faint">▾</span>
      </button>

      {open && pos && (
        <div
          id="ref-picker-panel"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            boxShadow: "var(--ug-shadow-overlay)",
          }}
          className="flex max-h-96 w-72 flex-col overflow-hidden rounded-lg border border-line bg-raised z-[var(--z-dropdown)]"
        >
          <input
            autoFocus
            value={query}
            spellCheck={false}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search refs…"
            className="shrink-0 border-b border-line bg-transparent px-3 py-2 font-mono text-xs text-ink placeholder:text-faint focus:outline-none"
          />
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {!filtered && <p className="px-3 py-2 text-xs text-faint">Loading…</p>}
            {filtered && (
              <>
                <Group
                  label="Branches"
                  items={filtered.branches.map((b) => ({
                    key: b.fullName,
                    ref: b.name,
                    primary: b.name,
                    secondary: b.isCurrent ? "current" : b.isRemote ? "remote" : undefined,
                  }))}
                  onChoose={choose}
                />
                <Group
                  label="Tags"
                  items={filtered.tags.map((t) => ({
                    key: t.fullName,
                    ref: t.name,
                    primary: t.name,
                  }))}
                  onChoose={choose}
                />
                <Group
                  label="Commits"
                  items={filtered.commits.map((c) => ({
                    key: c.id,
                    ref: c.id,
                    primary: c.summary,
                    secondary: c.shortId,
                  }))}
                  onChoose={choose}
                />
                {filtered.branches.length === 0 &&
                  filtered.tags.length === 0 &&
                  filtered.commits.length === 0 && (
                    <p className="px-3 py-2 text-xs text-faint">No matching refs.</p>
                  )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

type Item = { key: string; ref: string; primary: string; secondary?: string };

function Group({
  label,
  items,
  onChoose,
}: {
  label: string;
  items: Item[];
  onChoose: (ref: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="pb-1">
      <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium tracking-wide text-faint">
        {label.toUpperCase()}
      </p>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChoose(it.ref)}
          className="ease-out-quint flex w-full items-baseline gap-2 px-3 py-1 text-left transition-colors hover:bg-surface"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{it.primary}</span>
          {it.secondary && (
            <span className="shrink-0 font-mono text-[10px] text-faint">{it.secondary}</span>
          )}
        </button>
      ))}
    </div>
  );
}
