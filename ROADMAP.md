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

## Current state (from boilerplate)

- ✅ Cargo workspace: `ugit-core` / `ugit-cli` / `ugit-app`.
- ✅ Shared SQLite store (`diffs`, `comments`) in WAL mode; single `data_dir()` source of truth.
- ✅ Domain types: `Diff`, `Comment`, `DiffKind`.
- ✅ IPC pattern + 3 commands (`compute_diff`, `list_comments`, `add_comment`).
- ✅ CLI scaffold (`diff`, `comment`, `comment-add`).
- ✅ Release workflow + auto-updater wiring.
- ⚠️ `diff::compute_diff` is a **stub** — only validates the repo, computes no actual diff.
- ⚠️ Frontend is still Vite/React boilerplate; Tailwind installed but not wired; no diff/tree renderer.

---

## Open decisions (confirm before/at each epic)

- [ ] **D1 — Diff identity.** Recommend: dedupe diffs by `(repo_path, left_ref, right_ref, kind)`
  via `get_or_create_diff`, so re-opening the same comparison reuses the id and accumulates
  comments. (Today every `ugit diff` mints a fresh UUID → comments would scatter.)
- [ ] **D2 — Comment anchoring.** Recommend v1: anchor by `file + line + side` and snapshot the
  line's content at comment time. If a recompute can't find that anchor, mark the comment
  **stale** rather than silently moving it. Smart re-anchoring is post-v1.
- [ ] **D3 — Renderers.** CLAUDE.md mandates **diffs.com** for diffs and **trees.software** for
  the file tree. Confirm these are the libraries to install (neither is in `package.json` yet).

---

## Epic 0 — Foundations & app shell

- [ ] Strip Tauri/React boilerplate (`App.tsx`, logos, `greet`); remove the dead `greet` IPC reference.
- [ ] Wire Tailwind v4 into Vite + base stylesheet; establish design tokens (color, spacing, type scale).
- [ ] Dark/light theme with a single source of truth.
- [ ] App layout shell: sidebar + main pane + status bar.
- [ ] Frontend IPC client module (typed wrappers around `invoke`) + shared TS types mirroring core.
- [ ] Loading / empty / error state primitives used everywhere.

## Epic 1 — Diff engine (`ugit-core`, the heart)

- [ ] Ref resolution with `gix`: branch, tag, commit SHA, `HEAD`, short SHAs → tree/commit object.
- [ ] Working-tree / worktree state resolution (for worktree-to-worktree and dirty-tree diffs).
- [ ] Tree-to-tree change list: per file → status (added/modified/deleted/renamed/copied), mode changes.
- [ ] Per-file hunk computation: lines with old/new line numbers + change type; structured `DiffResult`.
- [ ] Edge cases: binary files, large-file truncation/skip, empty diff, rename/copy detection, EOL/whitespace.
- [ ] **Performance:** fast file-list first, hunks computed lazily/per-file; content-addressed cache
  keyed on `(left_tree_oid, right_tree_oid)` so re-open is instant.
- [ ] Stable serialized schema (`DiffResult`) shared by GUI + CLI.
- [ ] Unit tests over a fixture repo (added/modified/deleted/renamed/binary/large cases).

## Epic 2 — Repo introspection (`ugit-core`) — *only to pick refs*

- [ ] List local + remote branches (flag current).
- [ ] List commits for a ref (paginated log: sha, summary, author, time).
- [ ] List worktrees.
- [ ] List tags.
- [ ] Validate/resolve an arbitrary ref string (for the picker).
- [ ] Recent-repos list persisted in the store; "open repo" entry point.

## Epic 3 — CLI surface (`ugit-cli`)

- [ ] `ugit diff <left> <right>` actually emits the diff; persists/returns stable id (per D1).
  Add `--format json|patch|md`.
- [ ] `ugit comment <diff-id>` export (exists) — lock the JSON schema for agent consumption.
- [ ] `ugit comment-add` (exists) — ergonomic flags, validate anchor.
- [ ] `ugit diffs` — list recent diffs (id, refs, repo, comment count).
- [ ] `ugit open <diff-id>` — deep-link into the GUI for an existing diff (CLI ↔ GUI handoff).
- [ ] Golden tests on CLI output (stable schema).

## Epic 4 — GUI: diff viewing

- [ ] Repo picker (open folder) + recent repos.
- [ ] Ref picker: choose left & right from branches / commits / worktrees / tags.
- [ ] File tree via **trees.software**; diff pane via **diffs.com**.
- [ ] Unified/split toggle, syntax highlighting, binary/large-file fallbacks.
- [ ] Virtualized rendering for big diffs (hit the perf budget).
- [ ] Keyboard navigation: next/prev file, next/prev hunk, jump-to-file.

## Epic 5 — GUI: commenting

- [ ] Click a line/gutter → compose an inline comment (file + line + side).
- [ ] General (non-anchored) diff-level comments.
- [ ] Comment list / threads panel per diff; jump from comment to anchor.
- [ ] Edit / delete comments.
- [ ] Persist to the shared store; verify CLI export sees GUI comments live (the cross-surface guarantee).
- [ ] Stale-anchor display per D2.

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

## Suggested build order

`Epic 1 (diff engine)` → `Epic 3 (CLI wired to it)` → `Epic 2 (introspection)` →
`Epic 0 (shell)` → `Epic 4 (viewing)` → `Epic 5 (commenting)` → `Epic 6 (polish)` →
`Epic 7 (release)`.

Rationale: the diff engine is the product; building it first (with the CLI as the fastest
feedback loop) de-risks everything. The GUI is a thin viewer on top of a proven core.
