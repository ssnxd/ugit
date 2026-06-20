/** A ref chooser: a button showing the current ref that opens a searchable
 *  popover of branches, tags, and recent commits. Selecting one sets the ref.
 *  Worktree-based diffing is deferred (we only diff tree-to-tree today). */
import {
  Fragment,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { refData } from "../lib/ipc";
import type { BranchRef, CommitInfo, TagRef } from "../lib/types";

type RefData = { branches: BranchRef[]; tags: TagRef[]; commits: CommitInfo[] };
// Each item carries a precomputed lowercase haystack so filtering never lowercases per keystroke.
type RefItem = {
  key: string;
  ref: string;
  primary: string;
  secondary?: string;
  group: string;
  hay: string;
};
const MAX_VISIBLE = 200; // cap rendered rows; the rest are filtered to via search

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

  // Load ref data once, on first open — one IPC round-trip (ref_data).
  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    refData(repoPath)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ branches: [], tags: [], commits: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [open, data, repoPath]);

  // Anchor the fixed popover under the trigger (fixed escapes overflow clipping),
  // re-anchoring if the window resizes or scrolls while open.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const reposition = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  // Close on outside click / Escape; restore focus to the trigger on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) {
        const panel = document.getElementById("ref-picker-panel");
        if (!panel?.contains(e.target as Node)) setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
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
    triggerRef.current?.focus();
  }

  // The full flat list, built once per data load with a precomputed lowercase
  // haystack so filtering never lowercases per keystroke.
  const allItems = useMemo<RefItem[]>(() => {
    if (!data) return [];
    const out: RefItem[] = [];
    for (const b of data.branches) {
      out.push({
        key: b.fullName,
        ref: b.name,
        primary: b.name,
        secondary: b.isCurrent ? "current" : b.isRemote ? "remote" : undefined,
        group: "Branches",
        hay: b.name.toLowerCase(),
      });
    }
    for (const t of data.tags) {
      out.push({
        key: t.fullName,
        ref: t.name,
        primary: t.name,
        group: "Tags",
        hay: t.name.toLowerCase(),
      });
    }
    for (const c of data.commits) {
      out.push({
        key: c.id,
        ref: c.id,
        primary: c.summary,
        secondary: c.shortId,
        group: "Commits",
        hay: `${c.summary} ${c.shortId}`.toLowerCase(),
      });
    }
    return out;
  }, [data]);

  // Filter against the *deferred* query so typing never blocks on a big list,
  // and cap rendered rows.
  const deferredQuery = useDeferredValue(query);
  const items = useMemo<RefItem[] | null>(() => {
    if (!data) return null;
    const q = deferredQuery.trim().toLowerCase();
    const matched = q ? allItems.filter((it) => it.hay.includes(q)) : allItems;
    return matched.slice(0, MAX_VISIBLE);
  }, [data, allItems, deferredQuery]);

  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => setActiveIndex(0), [deferredQuery, open]);
  useEffect(() => {
    if (open)
      document.getElementById(`ref-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${label}: ${value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="ease-out-quint flex h-7 max-w-44 items-center gap-1.5 rounded-md border border-line bg-bg px-2 font-mono text-xs text-ink transition-colors hover:border-line-strong"
      >
        <span className="truncate">{value || label}</span>
        <span className="shrink-0 text-faint">▾</span>
      </button>

      {open && pos && (
        <div
          id="ref-picker-panel"
          role="dialog"
          aria-label={`Choose ${label} ref`}
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
            role="combobox"
            aria-expanded
            aria-controls="ref-picker-listbox"
            aria-activedescendant={items?.length ? `ref-opt-${activeIndex}` : undefined}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (!items || items.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const it = items[activeIndex];
                if (it) choose(it.ref);
              }
            }}
            placeholder="Search refs…"
            className="shrink-0 border-b border-line bg-transparent px-3 py-2 font-mono text-xs text-ink placeholder:text-faint focus:outline-none"
          />
          <div
            id="ref-picker-listbox"
            role="listbox"
            aria-label={`${label} refs`}
            className="min-h-0 flex-1 overflow-y-auto py-1"
          >
            {!items && <p className="px-3 py-2 text-xs text-faint">Loading…</p>}
            {items && items.length === 0 && (
              <p className="px-3 py-2 text-xs text-faint">No matching refs.</p>
            )}
            {items?.map((it, i) => {
              const header = i === 0 || items[i - 1].group !== it.group;
              const active = i === activeIndex;
              return (
                <Fragment key={it.key}>
                  {header && (
                    <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-medium tracking-wide text-faint">
                      {it.group.toUpperCase()}
                    </p>
                  )}
                  <button
                    id={`ref-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseMove={() => setActiveIndex(i)}
                    onClick={() => choose(it.ref)}
                    className={`flex w-full items-baseline gap-2 px-3 py-1 text-left ${
                      active ? "bg-surface" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">
                      {it.primary}
                    </span>
                    {it.secondary && (
                      <span className="shrink-0 font-mono text-[10px] text-faint">
                        {it.secondary}
                      </span>
                    )}
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
