/** A ⌘P-style fuzzy jumper over the diff's changed files. Opened with `p`. */
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";

import type { FileChange, FileStatus } from "../lib/types";

const GLYPH: Record<FileStatus, string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  copied: "C",
};

const MAX_VISIBLE = 200;

export function JumpToFile({
  files,
  onPick,
  onClose,
}: {
  files: FileChange[];
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  // Precompute lowercase paths once; filter against the deferred query so typing
  // stays responsive even at thousands of files; cap rendered rows.
  const indexed = useMemo(() => files.map((f) => ({ f, hay: f.path.toLowerCase() })), [files]);
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const hits = q ? indexed.filter((x) => x.hay.includes(q)) : indexed;
    return hits.slice(0, MAX_VISIBLE).map((x) => x.f);
  }, [indexed, deferredQuery]);

  useEffect(() => setActive(0), [deferredQuery]);
  useEffect(() => {
    document.getElementById(`jump-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Jump to file"
      onClick={onClose}
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-black/40 p-6 pt-[12vh]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--ug-shadow-overlay)" }}
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-line bg-raised"
      >
        <input
          autoFocus
          value={query}
          spellCheck={false}
          role="combobox"
          aria-expanded
          aria-controls="jump-listbox"
          aria-activedescendant={matches.length ? `jump-opt-${active}` : undefined}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(matches.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const f = matches[active];
              if (f) {
                onPick(f.path);
                onClose();
              }
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="Jump to file…"
          className="shrink-0 border-b border-line bg-transparent px-3 py-2.5 font-mono text-sm text-ink placeholder:text-faint focus:outline-none"
        />
        <div id="jump-listbox" role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
          {matches.length === 0 && (
            <p className="px-3 py-2 text-sm text-faint">No matching files.</p>
          )}
          {matches.map((f, i) => (
            <Fragment key={f.path}>
              <button
                id={`jump-opt-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => {
                  onPick(f.path);
                  onClose();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1 text-left font-mono text-sm ${
                  i === active ? "bg-surface" : ""
                }`}
              >
                <span className="w-3 shrink-0 text-center text-xs text-muted">
                  {GLYPH[f.status]}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{f.path}</span>
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
