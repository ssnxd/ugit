/**
 * The theme catalog ugit exposes. A single chosen theme drives the *entire* app
 * — chrome, file tree, and diff — and its light/dark `type` sets the mode. The
 * catalog is every bundled Shiki theme plus `@pierre/diffs`' custom Pierre
 * themes (which aren't in Shiki's bundle).
 */
import { bundledThemesInfo } from "shiki";

export type ThemeKind = "light" | "dark";
export type ThemeEntry = { id: string; label: string; type: ThemeKind };

const PIERRE: ThemeEntry[] = [
  { id: "pierre-dark", label: "Pierre Dark", type: "dark" },
  { id: "pierre-light", label: "Pierre Light", type: "light" },
];

export const THEME_CATALOG: ThemeEntry[] = [
  ...PIERRE,
  ...bundledThemesInfo.map((t) => ({ id: t.id, label: t.displayName, type: t.type })),
];

const TYPE_BY_ID: Record<string, ThemeKind> = Object.fromEntries(
  THEME_CATALOG.map((t) => [t.id, t.type]),
);

export const DEFAULT_THEME = "pierre-dark";

export function themeKind(id: string): ThemeKind {
  return TYPE_BY_ID[id] ?? "dark";
}

export function isThemeId(id: string): boolean {
  return id in TYPE_BY_ID;
}
