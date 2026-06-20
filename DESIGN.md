# Design

The visual system for ugit. Aesthetic: **terminal-native, executed with Linear-
grade craft** — dense and monospace-honest, but calm, precise, and quiet.

Colors are not invented here. **The active Shiki theme is the source of truth**
(see [Theming architecture](#theming-architecture)); this document defines the
*token contract*, typography, spacing, motion, and components that the theme
flows into.

## Theming architecture

ugit renders the diff with `@pierre/diffs` (diffs.com) and the file tree with
`trees.software`. Both are driven by **Shiki themes** (VS Code theme JSON). ugit
makes that one theme drive the *whole* app:

```
                 active Shiki theme (e.g. "pierre-dark")
                              │
        ┌─────────────────────┼─────────────────────────┐
        ▼                     ▼                           ▼
   @pierre/diffs        trees.software              ugit chrome
   theme="…"            themeToTreeStyles(theme)    theme adapter →
   (code + diff)        → --trees-theme-*           --ug-* CSS vars
                                                    (sidebar, top bar,
                                                     comments, palette)
```

- **Default theme:** `pierre-dark` (dark is the default per product). `pierre-
  light` is the bundled light counterpart. Both ship with diffs.com and are
  purpose-built for diff rendering.
- **Theme picker (v1 feature):** the user can choose any bundled Shiki theme
  (e.g. `vitesse-dark`, `vesper`, `github-dark-default`, `nord`, `catppuccin-
  mocha`, `vitesse-light`, `github-light-default`). The choice re-themes the diff,
  the tree, and ugit's chrome in one move and persists across sessions.
- **The theme adapter** reads the chosen theme's `colors` map and populates the
  `--ug-*` chrome tokens below. ugit ships static dark defaults so the shell
  renders instantly before/without a theme load.
- **Contrast guard:** when a derived chrome token falls below WCAG AA against its
  background, the adapter nudges it toward the ink/bg end of the ramp.

### Chrome token contract (`--ug-*`)

ugit's own UI reads only these semantic tokens (never a hard-coded color), so any
theme can drive it. Defaults shown are the static **dark** fallback (refined,
cool-neutral, low-chroma — the Linear register), in OKLCH.

```css
:root {
  /* surfaces (sidebar/panels are one step cooler/darker than content) */
  --ug-bg:             oklch(0.178 0.005 265);  /* app background        */
  --ug-surface:        oklch(0.212 0.006 265);  /* panels, sidebar       */
  --ug-surface-raised: oklch(0.246 0.007 265);  /* popovers, palette     */
  --ug-border:         oklch(0.300 0.008 265);  /* 1px hairlines         */
  --ug-border-strong:  oklch(0.380 0.010 265);  /* focused field borders */

  /* text */
  --ug-ink:    oklch(0.940 0.004 265);  /* primary text  (≥7:1 on bg)    */
  --ug-muted:  oklch(0.680 0.006 265);  /* secondary     (≥4.5:1 on bg)  */
  --ug-faint:  oklch(0.560 0.006 265);  /* line numbers, hints (≥3:1)    */

  /* accent — normally derived from the theme; this is the fallback */
  --ug-accent:      oklch(0.640 0.130 250); /* selection, primary action */
  --ug-accent-ink:  oklch(0.985 0 0);       /* text on filled accent     */
  --ug-focus:       oklch(0.700 0.140 250); /* focus ring                */

  /* state surfaces (tints of the relevant hue, never gray-on-color) */
  --ug-hover:    color-mix(in oklch, var(--ug-ink) 8%, transparent);
  --ug-selected: color-mix(in oklch, var(--ug-accent) 18%, transparent);
}
```

### Diff colors (colorblind-safe default)

Diff add/remove colors come from diffs.com CSS variables, layered on top of the
syntax theme. ugit's **default** is a colorblind-safe blue/orange pairing (not
red/green), and `+`/`−` gutter markers are always shown so the diff reads without
relying on hue. A "Classic red/green" option is available in settings.

```css
:root {
  /* added → cool/blue ; removed → warm/orange */
  --ug-diff-add-bg:    oklch(0.300 0.045 230);
  --ug-diff-add-line:  oklch(0.720 0.120 230);  /* marker + gutter       */
  --ug-diff-del-bg:    oklch(0.320 0.055 55);
  --ug-diff-del-line:  oklch(0.760 0.120 55);
  --ug-diff-gutter:    var(--ug-faint);
}
```

Non-color cues are mandatory: `+`/`−` in the gutter, and a left line treatment
(weight/marker) distinct per change type.

## Typography

Two families, paired on a hard contrast axis (mono vs. sans) — never two similar
sans.

- **Mono** (`--font-mono`) — the protagonist. Code, diffs, file paths, refs/SHAs,
  line numbers, stats, anything data-shaped.
  `"Berkeley Mono", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace`
- **Sans** (`--font-sans`) — UI prose only: buttons, menu items, labels, settings,
  comment body text. One family, multiple weights.
  `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`

**Fixed rem scale** (product UI views at consistent DPI — no fluid clamps), ratio
~1.125–1.2:

```css
--text-xs:  0.6875rem; /* 11px — line numbers, status bar          */
--text-sm:  0.75rem;   /* 12px — code, dense data                  */
--text-base:0.8125rem; /* 13px — default UI text                   */
--text-md:  0.875rem;  /* 14px — emphasized labels                 */
--text-lg:  1.0625rem; /* 17px — section / panel titles            */
--text-xl:  1.3125rem; /* 21px — the largest thing on a screen     */
```

Weights: 400 body, 500 UI/labels, 600 titles/emphasis. Prose (comment body)
caps at 65–75ch; code and tables run dense. `text-wrap: pretty` on prose.

## Spacing & layout

4px base unit. Tokens: `--space-1:4px … 2:8 · 3:12 · 4:16 · 5:20 · 6:24 · 8:32`.
Density is a feature — list/file rows ~26–28px tall.

**App shell** (resizable panes, keyboard-collapsible sidebar):

```
┌────────────────────────────────────────────────────────────┐
│  top bar — repo · ref selector (left … right) · theme · ⌘K   │ 40px
├──────────────┬─────────────────────────────────────────────┤
│  sidebar     │  main                                         │
│  file tree   │  diff (diffs.com)                             │
│ (trees.sw)   │                                               │
│              │                                               │
├──────────────┴─────────────────────────────────────────────┤
│  status bar — branch · +N −N · N files · shortcut hints      │ 24px
└────────────────────────────────────────────────────────────┘
```

- Flexbox for the 1D pane axes; Grid only where genuinely 2D.
- Responsive is **structural** (collapse sidebar, stack panes), not fluid type.
- Radii: `--radius-sm:4px` (rows, inputs) · `--radius:6px` (panels, buttons) ·
  `--radius-lg:8px` (palette, dialogs). Restrained — terminal-native, not bubbly.
- Borders: 1px hairlines (`--ug-border`). Separation by border + surface step,
  not shadow. No nested cards.
- Elevation: a single soft shadow for true overlays only (command palette,
  popovers, dialogs).
- **Z-index scale** (semantic, never 9999):
  `--z-dropdown:100 · --z-sticky:200 · --z-backdrop:300 · --z-modal:400 ·
  --z-toast:500 · --z-tooltip:600`.

## Components

Every interactive component ships all states: **default, hover, focus-visible,
active, disabled, loading, error**. Consistent vocabulary across the app — one
button shape, one input shape, one icon style (thin line icons, ~1.5px).

- **Buttons** — primary (filled `--ug-accent`, `--ug-accent-ink` text), secondary
  (surface + border), ghost (hover tint only). No gradients, no decorative shadow.
- **Inputs / ref pickers** — surface fill, hairline border, `--ug-border-strong`
  + focus ring on focus. Combobox for ref selection.
- **List rows** (files, branches, commits) — compact, hover tint, `--ug-selected`
  for the current selection, status glyph in the gutter (`A/M/D/R/C`).
- **Command palette (⌘K)** — the primary navigation surface; native `<dialog>` /
  popover so it escapes overflow contexts. Fuzzy over refs, files, actions.
- **Comment thread** — inline under the anchored line; sans body text; mono for
  any quoted code; clear author/time; edit/delete; a "stale anchor" state.
- **Empty states teach** (how to pick refs / open a repo), never "nothing here."
- **Loading is skeleton**, never a centered spinner over content.
- **Modals are a last resort** — prefer inline/popover/progressive disclosure.

## Motion

Motion conveys state, never decoration. 150–250 ms on most transitions; users are
in flow.

- Easing: ease-out only — `--ease: cubic-bezier(0.22, 1, 0.36, 1)`. No bounce,
  no elastic.
- Animate `opacity` / `transform` / `color` — not layout properties.
- Legitimate uses: selection/hover feedback, palette + popover enter/exit,
  comment expand, theme crossfade, staggered file-list reveal on first load.
- No orchestrated page-load choreography. The app loads into a task.
- **Reduced motion:** every transition has a `@media (prefers-reduced-motion:
  reduce)` fallback (crossfade or instant). Non-negotiable.

## Absolute bans (recap, project-specific)

No gradient text. No glassmorphism-by-default. No side-stripe accent borders. No
hero-metric template. No identical card grids. No per-section uppercase eyebrows
or `01/02/03` markers. No display fonts in UI labels. No reinvented scrollbars or
form controls. Text must never overflow its container at any breakpoint.
