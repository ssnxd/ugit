/** The ⌘K command palette (cmdk): run actions and pick a theme. This is the
 *  home for theme selection — it's not a top-bar menu. */
import { Command } from "cmdk";

import { THEME_CATALOG } from "../diff/themes";
import { useTheme } from "../theme/theme";

export type PaletteAction = { id: string; label: string; run: () => void };

export function CommandPalette({
  open,
  onClose,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
}) {
  const { shikiTheme, setShikiTheme } = useTheme();

  const select = (run: () => void) => {
    run();
    onClose();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      label="Command menu"
      shouldFilter
      overlayClassName="fixed inset-0 z-[var(--z-modal)] bg-black/40"
      contentClassName="fixed left-1/2 top-[14vh] z-[var(--z-modal)] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-raised text-ink [box-shadow:var(--ug-shadow-overlay)]"
    >
      <Command.Input
        placeholder="Type a command or search themes…"
        className="w-full border-b border-line bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none"
      />
      <Command.List className="max-h-[60vh] overflow-y-auto p-1">
        <Command.Empty className="px-3 py-6 text-center text-sm text-faint">
          No results.
        </Command.Empty>

        {actions.length > 0 && (
          <Command.Group
            heading="Actions"
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint"
          >
            {actions.map((a) => (
              <Command.Item
                key={a.id}
                value={a.label}
                onSelect={() => select(a.run)}
                className="ease-out-quint flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm text-muted aria-selected:bg-surface aria-selected:text-ink"
              >
                {a.label}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group
          heading="Theme"
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint"
        >
          {THEME_CATALOG.map((t) => (
            <Command.Item
              key={t.id}
              value={`theme ${t.label} ${t.id} ${t.type}`}
              onSelect={() => select(() => setShikiTheme(t.id))}
              className="ease-out-quint flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted aria-selected:bg-surface aria-selected:text-ink"
            >
              <span className="flex-1">{t.label}</span>
              <span className="font-mono text-[10px] text-faint">{t.type}</span>
              {t.id === shikiTheme && <span className="text-accent">●</span>}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
