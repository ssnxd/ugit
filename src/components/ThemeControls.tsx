/** Compact appearance controls for the top bar: cycle light/dark/system and
 *  toggle the colorblind-safe vs. classic diff palette. */
import { useTheme, type ThemeMode } from "../theme/theme";

const MODE_ORDER: ThemeMode[] = ["dark", "light", "system"];
const MODE_LABEL: Record<ThemeMode, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

const barButton =
  "ease-out-quint rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted transition-colors hover:bg-raised hover:text-ink";

export function ThemeControls() {
  const { mode, setMode, diffColors, setDiffColors } = useTheme();

  const cycleMode = () => {
    const next = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
    setMode(next);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={cycleMode}
        className={barButton}
        title="Cycle appearance (light / dark / system)"
      >
        {MODE_LABEL[mode]}
      </button>
      <button
        type="button"
        onClick={() => setDiffColors(diffColors === "safe" ? "classic" : "safe")}
        className={barButton}
        title="Diff colors: colorblind-safe (blue/orange) or classic (red/green)"
      >
        {diffColors === "safe" ? "Safe diff" : "Classic diff"}
      </button>
    </div>
  );
}
