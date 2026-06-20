/**
 * The single source of truth for ugit's appearance.
 *
 * For Epic 0 this governs the light/dark *mode* (the chrome token set) and the
 * diff color palette (colorblind-safe vs. classic). The Shiki theme catalog
 * picker (Epic 4) will layer on top: it repaints the same `--ug-*` tokens from
 * the chosen Shiki theme, and reports whether that theme is light or dark.
 */
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DEFAULT_SHIKI_THEME, isShikiThemeKey, type ShikiThemeKey } from "../diff/themes";

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedMode = "dark" | "light";
export type DiffColors = "safe" | "classic";
export type DiffStyle = "split" | "unified";

const MODE_KEY = "ugit.theme.mode";
const DIFF_KEY = "ugit.theme.diffColors";
const SHIKI_KEY = "ugit.theme.shiki";
const DIFFSTYLE_KEY = "ugit.theme.diffStyle";

type ThemeContextValue = {
  mode: ThemeMode;
  /** The mode actually applied, after resolving "system". */
  resolved: ResolvedMode;
  setMode: (mode: ThemeMode) => void;
  diffColors: DiffColors;
  setDiffColors: (value: DiffColors) => void;
  /** The chosen Shiki theme family (drives the diff renderer). */
  shikiTheme: ShikiThemeKey;
  setShikiTheme: (value: ShikiThemeKey) => void;
  /** Side-by-side ("split") vs. inline ("unified") diff layout. */
  diffStyle: DiffStyle;
  setDiffStyle: (value: DiffStyle) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const value = localStorage.getItem(key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function systemPrefersDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() =>
    readStored(MODE_KEY, ["dark", "light", "system"] as const, "dark"),
  );
  const [diffColors, setDiffColorsState] = useState<DiffColors>(() =>
    readStored(DIFF_KEY, ["safe", "classic"] as const, "safe"),
  );
  const [shikiTheme, setShikiThemeState] = useState<ShikiThemeKey>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(SHIKI_KEY) : null;
    return stored && isShikiThemeKey(stored) ? stored : DEFAULT_SHIKI_THEME;
  });
  const [diffStyle, setDiffStyleState] = useState<DiffStyle>(() =>
    readStored(DIFFSTYLE_KEY, ["split", "unified"] as const, "split"),
  );
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Track the OS preference only while mode is "system".
  useEffect(() => {
    if (mode !== "system" || typeof matchMedia === "undefined") return;
    const mql = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  const resolved: ResolvedMode = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  // Reflect state onto <html> so the CSS token sets apply.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.classList.toggle("light", resolved === "light");
    root.classList.toggle("diff-classic", diffColors === "classic");
    root.style.colorScheme = resolved;
  }, [resolved, diffColors]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    localStorage.setItem(MODE_KEY, next);
  }, []);

  const setDiffColors = useCallback((next: DiffColors) => {
    setDiffColorsState(next);
    localStorage.setItem(DIFF_KEY, next);
  }, []);

  const setShikiTheme = useCallback((next: ShikiThemeKey) => {
    setShikiThemeState(next);
    localStorage.setItem(SHIKI_KEY, next);
  }, []);

  const setDiffStyle = useCallback((next: DiffStyle) => {
    setDiffStyleState(next);
    localStorage.setItem(DIFFSTYLE_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved,
      setMode,
      diffColors,
      setDiffColors,
      shikiTheme,
      setShikiTheme,
      diffStyle,
      setDiffStyle,
    }),
    [
      mode,
      resolved,
      setMode,
      diffColors,
      setDiffColors,
      shikiTheme,
      setShikiTheme,
      diffStyle,
      setDiffStyle,
    ],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
