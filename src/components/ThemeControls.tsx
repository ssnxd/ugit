/** Top-bar appearance controls: Shiki theme picker (drives the diff + app),
 *  light/dark/system cycle, and the colorblind-safe vs. classic diff toggle. */
import { SHIKI_THEMES, type ShikiThemeKey } from "../diff/themes";
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
  const { mode, setMode, diffColors, setDiffColors, shikiTheme, setShikiTheme } = useTheme();

  const cycleMode = () => {
    const next = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
    setMode(next);
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={shikiTheme}
        onChange={(e) => setShikiTheme(e.currentTarget.value as ShikiThemeKey)}
        className={`${barButton} appearance-none pr-1`}
        title="Syntax theme (drives the diff and the app)"
      >
        {Object.entries(SHIKI_THEMES).map(([key, theme]) => (
          <option key={key} value={key}>
            {theme.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={cycleMode} className={barButton} title="Cycle appearance">
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
