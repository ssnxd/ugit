# ugit — v1 Roadmap

> **Product in one line:** a diff-focused git client for the agent era — look at any diff
> between any two refs, comment inline, and hand those comments to an agent. Desktop + CLI,
> one shared core, one shared store.
>
> **Core principles (every decision serves these):**
> 1. **Performance** — snappy, sub-perceptible diffs and navigation.
> 2. **Simplicity** — we do *one* thing: view diffs and comment on them.
> 3. **Polish** — a clean, highly usable interface.

## Scope discipline

**In v1:** diffing any pair of refs (branch/commit/worktree/tag/SHA), browsing a repo's
branches/commits/worktrees *only so you can pick refs to diff*, inline + general comments,
CLI export of comments for agents.

**Not in v1 (explicitly out):** staging/committing/pushing, merge/rebase/conflict tooling,
editing files, blame, repo creation/clone, remote auth flows, multi-repo dashboards,
collaboration/sync between machines.

---

## Current state

The core product is built — open repos, diff any refs, browse the file tree, view themed
diffs, and comment inline (with `ugit comment` agent export). Done so far: **Epic 0** (foundations
+ themed app shell), **Epic 1** (diff engine: file list, line-level hunks, unified patch, file
content), **Epic 2** (repo introspection + folder/ref pickers + recent repos), **Epic 4** (GUI
diff view via `@pierre/diffs` + `@pierre/trees`, Shiki theme picker, split/unified, j/k nav),
**Epic 5** (general + inline line-anchored comments, edit/delete, shared-store/CLI export).
App icons generated.

Remaining for v1: **Epic 3** (finish the CLI surface), **Epic 6** (performance + polish),
**Epic 7** (release readiness).

Foundations from the boilerplate, all still in place:

- ✅ Cargo workspace: `ugit-core` / `ugit-cli` / `ugit-app`.
- ✅ Shared SQLite store (`diffs`, `comments`, `recent_repos`) in WAL mode; single `data_dir()`.
- ✅ Tauri IPC pattern; shared camelCase serde schema across GUI + CLI JSON.
- ✅ Release workflow + auto-updater wiring.

---

## Decisions (locked)

- [x] **D1 — Diff identity.** Diffs are deduped by `(repo_path, left_ref, right_ref, kind)` via
  `store::get_or_create_diff`, so re-opening the same comparison reuses the id and accumulates
  comments. Shipped in Epic 1.
- [x] **D2 — Comment anchoring.** Comments anchor by `file + line + side` (inline threads in the
  diff). **Decided:** the line-content snapshot + stale-marking is *post-v1* — not blocking, so
  there is no `stale` flag yet. (Today a comment always renders at its stored line.)
- [x] **D3 — Renderers.** Locked on **Pierre**: `@pierre/diffs` for diffs + `@pierre/trees` for the
  file tree, both driven by **Shiki themes** (one theme drives the whole app via the theme
  picker). Installed and integrated in Epic 4.
- [x] **Theme model.** Chrome uses our tuned light/dark `--ug-*` token sets; the chosen Shiki theme
  drives the diff + tree, and diff colors route through colorblind-safe `--ug-diff-*` tokens.
  Repainting *all* chrome from an arbitrary Shiki theme's `colors` map is **out of scope for v1**.
- [x] **Worktree diffing.** The ref picker offers branches/tags/commits; **worktree (dirty-tree)
  diffing is post-v1** (we diff tree-to-tree only). `repo::worktrees` exists for listing.

---

## Epic 0 — Foundations & app shell

- [x] Strip Tauri/React boilerplate (`App.tsx`, logos, `greet`); remove the dead `greet` IPC reference.
- [x] Wire Tailwind v4 into Vite + base stylesheet; establish design tokens (`--ug-*`, type/space/radius/z scales).
- [x] Dark/light theme with a single source of truth (`theme.tsx`, persisted; Shiki-theme picker deferred to Epic 4).
- [x] App layout shell: top bar + sidebar + main pane + status bar.
- [x] Frontend IPC client module (typed wrappers around `invoke`) + shared TS types mirroring core.
- [x] Loading / empty / error state primitives used everywhere.

## Epic 1 — Diff engine (`ugit-core`, the heart)

- [x] Ref resolution with `gix`: branch, tag, commit SHA, `HEAD`, short SHAs → tree (`resolve_tree`).
- [ ] Working-tree / dirty-tree diffing. *(Post-v1 — a substantial feature: needs gix's `status`
  machinery (feature-gated dirwalk + index↔worktree + tree↔index passes merged), reading worktree
  files from disk, and untracked/staged handling, with edge cases that warrant real dirty-repo +
  GUI testing. Deferred deliberately to keep v1 stable; tree-to-tree covers branch/commit/tag/SHA.)*
- [x] Tree-to-tree change list: per file → status (added/modified/deleted/renamed/copied) + line counts (`diff_summary`).
- [x] Per-file hunk computation: lines with old/new line numbers + change type, via one `gix` `UnifiedDiff` pass (`file_hunks` / `diff_detail`). `unified_diff` renders the git patch; `file_content` reads a side.
- [x] Edge cases: binary detection (NUL heuristic), empty diff, rename/copy detection, large-file
  truncation (`MAX_DIFF_BYTES`). *(EOL normalized to `\n`.)*
- [x] **Performance:** fast file-list first (`diff_summary`), hunks computed lazily per-file (`file_hunks`). *(content-addressed cache deferred to Epic 6 perf pass)*
- [x] Stable serialized schema shared by GUI + CLI (camelCase serde on `DiffSummary`/`FileChange`/`Hunk`/`DiffLine`/`FileDiffDetail`).
- [x] Unit tests over a fixture repo (added/modified/deleted, line numbers, patch render, file content, bad ref). *(renamed/large cases deferred)*

## Epic 2 — Repo introspection (`ugit-core`) — *only to pick refs*

**Cut 1 — core + Tauri commands (done):** `ugit-core::repo` + `recent_repos` store + IPC commands + TS bindings.

- [x] List local + remote branches (flag current). `repo::branches`
- [x] List commits for a ref (paginated log: sha, summary, author, time). `repo::commits`
- [x] List worktrees. `repo::worktrees`
- [x] List tags. `repo::tags`
- [x] Validate/resolve a ref + repo metadata. `repo::repo_info` (+ `rev_parse_single` in `commits`).
- [x] Recent-repos list persisted in the store; `open_repo` entry point. `store::record_repo` / `list_recent_repos`.

**Cut 2 — GUI pickers (done):**
- [x] Folder picker (`tauri-plugin-dialog`) + recent-repos list start screen (`RepoOpener`); top bar shows repo name/branch, click to switch repos.
- [x] Ref picker (`RefPicker`): searchable popover of branches / tags / commits for left & right, replacing the text inputs. *(worktree-based diffing deferred with dirty-diff support.)*

## Epic 3 — CLI surface (`ugit-cli`)

**Cut 1 — CLI completeness (done):**
- [x] `ugit diff <left> <right>` emits the diff; persists/returns stable id (per D1). `--format stat|patch|json`.
- [x] `ugit comment <diff-id>` export — JSON schema locked to camelCase (`diffId`/`filePath`/`createdAt`), covered by a unit test.
- [x] `ugit comment-add` — validates `--side` (left|right), `--line` (>0, requires `--file`).
- [x] `ugit diffs [--repo] [--limit] [--format table|json]` — recent diffs with comment counts (`store::list_diffs` + `DiffListItem`).
- [x] Unit tests on CLI render helpers + comment schema.

**Cut 2 — GUI handoff (done):**
- [x] `ugit open <diff-id>` — validates the id, then opens the `ugit://diff/<id>` deep link (`open` crate). `tauri-plugin-deep-link` registers the `ugit` scheme; `get_diff` command + the App deep-link handler resolve the id → open repo + refs + run diff. *(Build-verified; full flow needs a bundled app on macOS for scheme registration. `tauri-plugin-single-instance` for perfect Linux/Windows routing is a follow-up.)*

## Epic 4 — GUI: diff viewing

- [x] Repo picker (open folder) + recent repos. *(delivered in Epic 2 Cut 2 — `RepoOpener`)*
- [x] Ref picker: choose left & right from branches / commits / tags. *(delivered in Epic 2 Cut 2 — `RefPicker`; worktree picking is post-v1)*
- [x] Diff pane via **diffs.com** — `MultiFileDiff` fed `file_content`, split view, Shiki highlighting, binary fallback, loading skeleton. *(Cut 1)*
- [x] **Shiki theme system (one-theme-everywhere):** theme picker (`SHIKI_THEMES`) drives the diff + app; `pierre-dark`/`pierre-light` default; diff colors routed through colorblind-safe `--ug-*` tokens via `--diffs-*-override`. Worker pool wired for Vite. *(Cut 1)*
- [x] File tree via **trees.software** (`FileTreeSidebar`) — nested folders, file-type icons, git-status colors, +/− row decorations, two-way selection sync, themed via `--trees-*`→`--ug-*`. *(Cut 2)*
- [x] Unified/split toggle (persisted `diffStyle`); binary fallback. *(Cut 2)*
- [x] Virtualized rendering for big diffs — `@pierre/diffs` virtualizes internally; plus a
  large-file guard (`MAX_DIFF_BYTES`, 1.5 MB) that skips highlighting huge/minified files and shows
  a "not shown" fallback.
- [x] Keyboard navigation: next/prev file (`j`/`k`) + `p` fuzzy jump-to-file (`JumpToFile` palette).
  *(next/prev **hunk** scroll deferred — needs diffs.com's internal scroll API across the shadow
  boundary; fragile to do reliably.)*
- [x] **One Shiki theme drives the whole app.** Picking a theme (full Shiki catalog via
  `bundledThemesInfo` + `pierre-*`, chosen in the **⌘K palette**, `cmdk`) repaints the `--ug-*`
  chrome tokens from its resolved colors (`resolveThemes`/`getResolvedThemes` → `--ug-bg/ink/accent`;
  surface/border/muted/faint derive via `color-mix`), drives the tree (`--trees-*`→`--ug-*`) and
  diff, and its `type` sets light/dark. The top-bar theme menu is gone.

## Epic 5 — GUI: commenting

**Cut 1 — data layer + comments panel (done):** `update_comment`/`delete_comment` store + commands, `computeDiff` wiring for the stable diff id, `CommentsPanel`.

- [x] General (non-anchored) diff-level comments.
- [x] Comment list panel per diff (file-scoped + general), with comment count toggle.
- [x] Edit / delete comments.
- [x] Persist to the shared store; verified CLI export (`ugit comment --format md/json`) sees the same comments (cross-surface guarantee).

**Cut 2 — inline anchoring (done):**
- [x] Hover a diff line → "+" in the gutter (`renderGutterUtility`) → compose an inline comment (file + line + side); existing comments render inline as threads via `lineAnnotations`/`renderAnnotation`; reply/edit/delete inline. Store side `left`/`right` ↔ diffs `deletions`/`additions`.
- [x] **Fixed a real bug:** the diff renderer produced nothing if it mounted before the Shiki worker pool was ready (no retry). Added `useWorkerReady` (gates on `WorkerPoolManager.isInitialized()` + stat changes); `DiffView` waits for it. This also fixed the blank-first-render seen in Epic 4.
- [x] Stale-anchor display per D2 — `comments.line_content` snapshot column (additive migration);
  inline threads show a "⚠ stale — line changed" badge when the anchored line no longer matches.

## Epic 6 — Performance & polish

- [x] Performance: object cache on every repo open (gix), worker-readiness gating, memoized
  `lineAnnotations`/`selectedFile`, async run/comment cancellation tokens. *(A formal perf-budget
  harness is post-v1; the two-expert audit confirmed no hot-path regressions.)*
- [x] Empty/error/loading states across views (skeletons, teaching empty states, `ErrorState`,
  top-level `ErrorBoundary`); friendly git/repo errors surfaced from core `Error::Git`.
- [x] Global keyboard shortcuts (`j`/`k`, `c`, `s`, `o`, `?`) + a shortcut overlay (`ShortcutsOverlay`).
- [x] Accessibility pass: global `:focus-visible` rings, RefPicker `aria-expanded`/`role="dialog"` +
  focus restore + reposition-on-resize, colorblind-safe diff palette, honored reduced-motion.
  *(Full listbox arrow-nav in RefPicker is a minor follow-up.)*
- [x] **Two-expert QA audit** (Rust + frontend): fixed error-masking (diff_summary), object cache,
  diffs index, async races (run/comments), worker-readiness subscription; added rename/binary/
  empty/detached tests. Deferred (documented): pass an open `&Repository` to avoid per-call
  reopen (H2), blob-id reuse, full RefPicker listbox a11y.

## Epic 7 — Release readiness

- [x] Core + CLI tests green (26: 22 core, 4 CLI); frontend tests green (Vitest).
- [x] `pnpm build`/`lint`/`test`, `cargo test --workspace`, `cargo clippy --workspace`,
  `cargo fmt --check` all green.
- [x] Cross-platform release workflow (`release.yml`): macOS arm64/x64, Linux, Windows bundles +
  standalone CLI binaries + `latest.json`, via `tauri-action`. App icons generated.
- [x] Updater `pubkey` set in `tauri.conf.json` (signing key generated). **User-run:** confirm the
  `TAURI_SIGNING_PRIVATE_KEY` + `…_PASSWORD` GitHub secrets exist.
- [x] README / usage docs (desktop + full CLI reference + agent workflow).
- [ ] **User-run:** `git tag v0.1.0 && git push origin v0.1.0` → verify the draft release (bundles,
  CLI binaries, `latest.json`). *(Requires GitHub remote + secrets; can't be done from here.)*

---

## Status: v1 complete 🎉

All epics done: Epic 1 (diff engine) → Epic 0 (shell) → Epic 4 (diff viewing) → Epic 2
(introspection + pickers) → Epic 5 (commenting) → Epic 3 (CLI) → Epic 6 (perf + polish) →
Epic 7 (release readiness). Plus app icons, favicon, and a two-expert code/perf audit.

Plus the follow-up polish pass: stale-anchor (D2), large-file guard, RefPicker listbox keyboard nav,
jump-to-file (`p`), virtualization confirmed.

**User-run, outside this environment:** push the `v0.1.0` tag to trigger the release workflow (needs
the GitHub remote + the two `TAURI_SIGNING_*` secrets), then verify the draft release.

**Post-v1 backlog (deliberately deferred, with rationale above):**
- **Worktree / dirty-tree diffing** — a substantial gix-`status` feature; warrants its own tested pass.
- **Chrome-from-Shiki-theme** — `pierre-*` colors aren't cleanly readable client-side; needs a worker round-trip.
- **next/prev hunk scroll** — needs diffs.com's internal scroll API across the shadow boundary.
- **single-instance deep-link routing** (Linux/Windows) and **pass-open-`&Repository` perf (H2)** —
  unverifiable-in-dev / mitigated by the object cache respectively; low marginal value vs. risk.
