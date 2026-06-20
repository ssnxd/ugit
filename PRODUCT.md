# Product

## Register

product

## Users

Engineers working in the agent era. Their day involves reviewing diffs — often
changes an agent generated — and they need to understand what changed, judge it,
and respond. They work at a desk in long, focused sessions, with ugit sitting
alongside a code editor and terminal (usually dark). They live on the keyboard.

The job to be done: **scan a diff fast, comment on it inline, and hand those
comments back to an agent** (the CLI exports comments as JSON/Markdown). ugit is
where review happens; the agent acts on the result.

## Product Purpose

ugit is a diff-focused git client — a desktop app and a CLI sharing one Rust
core and one store. It compares any two repository states (branch, commit,
worktree, tag, SHA), renders the diff, and lets the user comment inline. Repo
browsing (branches/commits/worktrees) exists *only* so the user can pick refs to
compare.

It deliberately does **one thing**: view diffs and comment on them. Success is
when the tool disappears into the task — diffs feel instant, navigation is
keyboard-fluent, and the review-comment-handoff loop is faster than GitHub's web
UI or any existing git GUI.

## Brand Personality

Precise, fast, calm. Developer-honest and keyboard-first. The north star is
**"if Linear made a diff tool"**: terminal-native density and monospace honesty,
executed with Linear-grade craft — restraint, exactness, and speed. Confident
without decoration. The interface should feel like part of the user's toolchain,
not a separate destination.

## Anti-references

- **Heavy git GUIs** (SourceTree, GitKraken) — busy toolbars, panel sprawl,
  commit-graph spaghetti, enterprise heaviness.
- **GitHub's web diff/PR UI** — cramped, chrome-heavy, slow-feeling, too many
  competing actions.
- **Generic SaaS dashboards** — card grids, gradient hero metrics, rounded
  everything, templated-startup look.
- **Cluttered IDE chrome** — walls of panels and status bars fighting for
  attention.

## Design Principles

- **The diff is the product.** Everything else recedes so the changed code is
  the loudest thing on screen.
- **Theme-native, not brand-painted.** ugit adopts the user's chosen Shiki theme
  across the *entire* app (diff, file tree, and our own chrome). ugit's identity
  lives in form, typography, motion, and speed — not a fixed accent color.
- **Earned familiarity over novelty.** Reuse the affordances expert users
  already know from Linear / Zed / Raycast. The tool should be trustworthy at a
  glance, not surprising.
- **Keyboard-first.** Every primary action has a shortcut; the mouse is optional.
- **Performance is a feature.** Interactions are sub-perceptible. No spinners
  mid-content — skeletons and instant transitions instead.
- **Accessible by default.** Colorblind-safe diffs with non-color cues, WCAG AA
  contrast, full keyboard nav, honored reduced-motion.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Diff coloring never relies on hue alone: a colorblind-
safe palette option (blue/orange-leaning) plus always-on `+`/`−` gutter markers
and line styling, so diffs read in grayscale and under deuteranopia/protanopia.
Full keyboard navigation with a visible focus ring. `prefers-reduced-motion` is
honored everywhere (crossfade/instant fallbacks). Because colors derive from the
active Shiki theme, ugit validates contrast of the derived chrome tokens and
nudges them toward the ink/bg ends when a theme would fall below AA.
