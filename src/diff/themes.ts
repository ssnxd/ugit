/**
 * The Shiki theme catalog ugit exposes in the theme picker. Each entry is a
 * dark/light pair of theme names that `@pierre/diffs` understands (its custom
 * `pierre-*` themes plus any bundled Shiki theme). The active entry drives the
 * diff renderer; ugit's chrome follows the resolved light/dark mode.
 */
export type ShikiThemePair = {
  label: string;
  dark: string;
  light: string;
};

export const SHIKI_THEMES = {
  pierre: { label: "Pierre", dark: "pierre-dark", light: "pierre-light" },
  vitesse: { label: "Vitesse", dark: "vitesse-dark", light: "vitesse-light" },
  github: { label: "GitHub", dark: "github-dark-default", light: "github-light-default" },
  one: { label: "One", dark: "one-dark-pro", light: "one-light" },
  catppuccin: { label: "Catppuccin", dark: "catppuccin-mocha", light: "catppuccin-latte" },
} as const satisfies Record<string, ShikiThemePair>;

export type ShikiThemeKey = keyof typeof SHIKI_THEMES;

export const DEFAULT_SHIKI_THEME: ShikiThemeKey = "pierre";

export function isShikiThemeKey(value: string): value is ShikiThemeKey {
  return value in SHIKI_THEMES;
}
