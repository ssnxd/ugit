/** The sidebar file listing for a diff summary. Flat for now; a real tree
 *  (trees.software) lands in Epic 4. */
import type { FileChange, FileStatus } from "../lib/types";

const STATUS_GLYPH: Record<FileStatus, { letter: string; className: string; label: string }> = {
  added: { letter: "A", className: "text-[var(--ug-diff-add-line)]", label: "Added" },
  deleted: { letter: "D", className: "text-[var(--ug-diff-del-line)]", label: "Deleted" },
  modified: { letter: "M", className: "text-accent", label: "Modified" },
  renamed: { letter: "R", className: "text-muted", label: "Renamed" },
  copied: { letter: "C", className: "text-muted", label: "Copied" },
};

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function FileList({
  files,
  selected,
  onSelect,
}: {
  files: FileChange[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="flex flex-col py-1">
      {files.map((file) => {
        const glyph = STATUS_GLYPH[file.status];
        const isSelected = file.path === selected;
        const dir = dirname(file.path);
        return (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => onSelect(file.path)}
              aria-current={isSelected}
              className={`ease-out-quint flex w-full items-center gap-2 px-3 py-1 text-left text-sm transition-colors ${
                isSelected ? "bg-accent/15 text-ink" : "text-muted hover:bg-ink/8 hover:text-ink"
              }`}
            >
              <span
                className={`w-3 shrink-0 text-center font-mono text-xs font-semibold ${glyph.className}`}
                title={glyph.label}
              >
                {glyph.letter}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono">
                <span className="text-ink">{basename(file.path)}</span>
                {dir && <span className="text-faint"> {dir}</span>}
              </span>
              {file.binary ? (
                <span className="shrink-0 font-mono text-xs text-faint">bin</span>
              ) : (
                <span className="shrink-0 font-mono text-xs tabular-nums">
                  <span className="text-[var(--ug-diff-add-line)]">+{file.additions}</span>{" "}
                  <span className="text-[var(--ug-diff-del-line)]">−{file.deletions}</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
