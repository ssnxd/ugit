/** A keyboard-shortcut cheat sheet, toggled with `?`. */
const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Command palette (themes + actions)" },
  { keys: ["j"], label: "Next file" },
  { keys: ["k"], label: "Previous file" },
  { keys: ["p"], label: "Jump to file" },
  { keys: ["c"], label: "Toggle comments" },
  { keys: ["s"], label: "Toggle split / unified" },
  { keys: ["o"], label: "Open / switch repository" },
  { keys: ["?"], label: "Toggle this help" },
  { keys: ["Esc"], label: "Close help" },
];

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-xs text-ink">
      {children}
    </kbd>
  );
}

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--ug-shadow-overlay)" }}
        className="w-full max-w-sm overflow-hidden rounded-lg border border-line bg-raised"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="text-md font-medium text-ink">Keyboard shortcuts</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ease-out-quint rounded-md px-1.5 py-0.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            ✕
          </button>
        </div>
        <ul className="flex flex-col px-4 py-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-muted">{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <Key key={k}>{k}</Key>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
