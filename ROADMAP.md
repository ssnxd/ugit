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
- [ ] Working-tree / worktree state resolution (for worktree-to-worktree and dirty-tree diffs). *(deferred — tree-to-tree covers branch/commit/tag/SHA; dirty worktree diff comes with Epic 2)*
- [x] Tree-to-tree change list: per file → status (added/modified/deleted/renamed/copied) + line counts (`diff_summary`).
- [x] Per-file hunk computation: lines with old/new line numbers + change type, via one `gix` `UnifiedDiff` pass (`file_hunks` / `diff_detail`). `unified_diff` renders the git patch; `file_content` reads a side.
- [x] Edge cases: binary detection (NUL heuristic), empty diff, rename/copy detection. *(large-file truncation deferred to perf pass; EOL stripped to `\n`)*
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

**Cut 2 — GUI handoff (next):**
- [ ] `ugit open <diff-id>` — deep-link into the GUI for an existing diff (URL scheme + `tauri-plugin-deep-link` + GUI routing by diff id).

## Epic 4 — GUI: diff viewing

- [x] Repo picker (open folder) + recent repos. *(delivered in Epic 2 Cut 2 — `RepoOpener`)*
- [x] Ref picker: choose left & right from branches / commits / tags. *(delivered in Epic 2 Cut 2 — `RefPicker`; worktree picking is post-v1)*
- [x] Diff pane via **diffs.com** — `MultiFileDiff` fed `file_content`, split view, Shiki highlighting, binary fallback, loading skeleton. *(Cut 1)*
- [x] **Shiki theme system (one-theme-everywhere):** theme picker (`SHIKI_THEMES`) drives the diff + app; `pierre-dark`/`pierre-light` default; diff colors routed through colorblind-safe `--ug-*` tokens via `--diffs-*-override`. Worker pool wired for Vite. *(Cut 1)*
- [x] File tree via **trees.software** (`FileTreeSidebar`) — nested folders, file-type icons, git-status colors, +/− row decorations, two-way selection sync, themed via `--trees-*`→`--ug-*`. *(Cut 2)*
- [x] Unified/split toggle (persisted `diffStyle`); binary fallback. *(Cut 2)*
- [ ] Virtualized rendering for big diffs (hit the perf budget). *(diffs.com virtualizes; revisit in Epic 6)*
- [x] Keyboard navigation: next/prev file (`j`/`k`). *(next/prev hunk + jump-to-file deferred)*
- [ ] Chrome tokens repainted from the active Shiki theme's `colors` map (currently chrome follows our tuned light/dark sets). *(Cut 2 stretch)*

## Epic 5 — GUI: commenting

**Cut 1 — data layer + comments panel (done):** `update_comment`/`delete_comment` store + commands, `computeDiff` wiring for the stable diff id, `CommentsPanel`.

- [x] General (non-anchored) diff-level comments.
- [x] Comment list panel per diff (file-scoped + general), with comment count toggle.
- [x] Edit / delete comments.
- [x] Persist to the shared store; verified CLI export (`ugit comment --format md/json`) sees the same comments (cross-surface guarantee).

**Cut 2 — inline anchoring (done):**
- [x] Hover a diff line → "+" in the gutter (`renderGutterUtility`) → compose an inline comment (file + line + side); existing comments render inline as threads via `lineAnnotations`/`renderAnnotation`; reply/edit/delete inline. Store side `left`/`right` ↔ diffs `deletions`/`additions`.
- [x] **Fixed a real bug:** the diff renderer produced nothing if it mounted before the Shiki worker pool was ready (no retry). Added `useWorkerReady` (gates on `WorkerPoolManager.isInitialized()` + stat changes); `DiffView` waits for it. This also fixed the blank-first-render seen in Epic 4.
- [ ] Stale-anchor display per D2 (needs a line-content-snapshot column; deferred).

## Epic 6 — Performance & polish

- [ ] Define a perf budget (cold app open, repo open, diff render, file switch) and measure it.
- [ ] Profile + fix the slowest paths until navigation feels instant.
- [ ] Empty/error/loading states for every view; friendly git/repo errors.
- [ ] Global keyboard shortcuts + a shortcut overlay.
- [ ] Accessibility pass (focus, contrast, keyboard-only).

## Epic 7 — Release readiness

- [ ] Core diff-engine tests + store tests green; frontend component tests for diff/comment flows.
- [ ] `pnpm build` (tsc), `pnpm lint`, `pnpm test`, `cargo clippy`, `cargo fmt --check`, `cargo test` all green in CI.
- [ ] Cross-platform bundle + standalone CLI binaries build.
- [ ] Updater signing key generated + `pubkey` set + GitHub secrets (one-time, user-run).
- [ ] README / usage docs (GUI + CLI + agent workflow example).
- [ ] Tag `v0.1.0` → draft release verified (bundles, CLI binaries, `latest.json`).

---

## Build order

**Done:** Epic 1 (diff engine) → Epic 0 (shell) → Epic 4 (diff viewing) → Epic 2 (introspection +
pickers) → Epic 5 (commenting). Plus app icons.

**Remaining:** Epic 3 (finish CLI) → Epic 6 (perf + polish) → Epic 7 (release).
