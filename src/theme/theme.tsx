/**
 * ugit's appearance, governed by a single chosen Shiki theme. The theme drives
 * the whole app (chrome, tree, diff) and its light/dark `type` sets the mode;
 * `DiffWorkerProvider` repaints the `--ug-*` chrome tokens from the theme's
 * resolved colors. Two orthogonal toggles remain: the colorblind-safe vs.
 * classic diff palette, and split vs. unified layout.
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

import { DEFAULT_THEME, isThemeId, themeKind } from "../diff/themes";

export type ResolvedMode = "dark" | "light";
export type DiffColors = "safe" | "classic";
export type DiffStyle = "split" | "unified";

const THEME_KEY = "ugit.theme.shiki";
const DIFF_KEY = "ugit.theme.diffColors";
const DIFFSTYLE_KEY = "ugit.theme.diffStyle";

type ThemeContextValue = {
  /** The chosen Shiki theme id — drives chrome + tree + diff. */
  shikiTheme: string;
  setShikiTheme: (id: string) => void;
  /** Light/dark, derived from the theme's type. */
  resolved: ResolvedMode;
  diffColors: DiffColors;
  setDiffColors: (value: DiffColors) => void;
  diffStyle: DiffStyle;
  setDiffStyle: (value: DiffStyle) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const value = localStorage.getItem(key);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [shikiTheme, setShikiThemeState] = useState<string>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(THEME_KEY) : null;
    return stored && isThemeId(stored) ? stored : DEFAULT_THEME;
  });
  const [diffColors, setDiffColorsState] = useState<DiffColors>(() =>
    readStored(DIFF_KEY, ["safe", "classic"] as const, "safe"),
  );
  const [diffStyle, setDiffStyleState] = useState<DiffStyle>(() =>
    readStored(DIFFSTYLE_KEY, ["split", "unified"] as const, "split"),
  );

  const resolved: ResolvedMode = themeKind(shikiTheme);

  // Reflect light/dark + diff palette onto <html> so the CSS token sets apply.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.classList.toggle("light", resolved === "light");
    root.classList.toggle("diff-classic", diffColors === "classic");
    root.style.colorScheme = resolved;
  }, [resolved, diffColors]);

  const setShikiTheme = useCallback((next: string) => {
    setShikiThemeState(next);
    localStorage.setItem(THEME_KEY, next);
  }, []);

  const setDiffColors = useCallback((next: DiffColors) => {
    setDiffColorsState(next);
    localStorage.setItem(DIFF_KEY, next);
  }, []);

  const setDiffStyle = useCallback((next: DiffStyle) => {
    setDiffStyleState(next);
    localStorage.setItem(DIFFSTYLE_KEY, next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      shikiTheme,
      setShikiTheme,
      resolved,
      diffColors,
      setDiffColors,
      diffStyle,
      setDiffStyle,
    }),
    [shikiTheme, setShikiTheme, resolved, diffColors, setDiffColors, diffStyle, setDiffStyle],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
