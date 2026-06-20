# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`ugit` is a **diff-focused git client built for the agent era**, packaged as both a desktop app and a CLI. It is built with Tauri v2 (Rust backend) + React 19 + TypeScript + Vite. Package manager is **pnpm**. The app operates on _other_ repos the user opens, not on itself.

The product centers on diffs:

- **Arbitrary diffs** — branch-to-branch, worktree-to-worktree, commit-to-commit, or any pair of refs the user wants to compare.
- **Commentable diffs** — users can annotate changes inline, leaving comments tied to a diff.
- **CLI surface** — the same capabilities are available from the terminal. For example, `ugit comment <diff-id>` exports all comments on a diff as JSON or Markdown, so an agent can consume them and act on the feedback.

> Note: the above describes the intended product. Features are described here as goals, not as a record of what is already implemented.

## Architecture: Cargo workspace with a shared core

The repo is a **Cargo workspace** (root `Cargo.toml`) with three members:

- `crates/ugit-core` — pure-Rust library (no Tauri). All domain logic lives here: git/diff (`gix`), the SQLite store, and the domain types (`Diff`, `Comment`, `DiffKind`). `gix` lives here, **not** in `src-tauri`.
- `crates/ugit-cli` — the `ugit` binary (clap). Thin shell over `ugit-core`.
- `src-tauri` — the Tauri desktop app. Also a thin shell over `ugit-core`; its `#[tauri::command]`s open the store and delegate.

**The golden rule: both surfaces share one store.** The GUI and CLI are separate processes, so the path they open must be identical. That path is owned by `ugit_core::store::data_dir()` (derived from `store::IDENTIFIER`, which must match `identifier` in `tauri.conf.json`). **Never** resolve the store path via Tauri's path API in the GUI — always go through `ugit-core` so the two can't drift. The DB (`ugit.db`) is opened in **WAL mode with a busy-timeout** (`store::open`) so the GUI and CLI can read/write concurrently. Add new behavior to `ugit-core` and expose it from both shells; don't put logic in `src-tauri` or `ugit-cli`.

The CLI ships two ways: as a **sidecar** inside the app bundle (`bundle.externalBin` in `tauri.conf.json`) and as standalone per-OS release binaries. `scripts/stage-sidecar.sh [triple]` builds `ugit-cli` and copies it to `src-tauri/binaries/ugit-<triple>` where Tauri expects the sidecar — **run it before `pnpm tauri dev`/`build`** (the dir is gitignored).

## Commands

- `scripts/stage-sidecar.sh` — build the `ugit` CLI and stage it as the sidecar. **Run this once before `pnpm tauri dev`/`build`** (and after CLI changes), or the bundle step fails on the missing `externalBin`.
- `pnpm tauri dev` — run the full app (launches Vite on :1420 **and** the Rust window). Use this to run the app, not `pnpm dev`.
- `cargo build` (workspace root) — build all three crates. `cargo build -p ugit-cli` / `-p ugit-core` / `-p ugit-app` for one (the desktop app crate is `ugit-app`).
- `cargo run -p ugit-cli -- <args>` — run the CLI (e.g. `cargo run -p ugit-cli -- comment <diff-id> --format md`). `cargo test -p ugit-core` for the store tests.
- `pnpm dev` — Vite frontend only (browser, no Tauri APIs). `invoke()` calls fail here.
- `pnpm tauri build` — production bundle.
- `pnpm build` — frontend-only build = `tsc && vite build` (type-check + bundle). Run this to type-check the frontend.
- `pnpm lint` — lint the frontend with **oxlint**. `pnpm format` — format with **oxfmt** (not ESLint/Prettier).
- `pnpm test` — run the frontend test suite (**Vitest** + Testing Library, jsdom). `pnpm test:watch` for watch mode.
- Rust: `cargo build` / `cargo clippy` / `cargo fmt` / `cargo test` from `src-tauri/`.

Vite is pinned to port **1420** with `strictPort: true` — dev fails if the port is taken.

## Tauri IPC pattern (Rust ↔ frontend)

This is the core pattern for every feature:

1. Define a Rust command in `src-tauri/src/lib.rs`: `#[tauri::command] fn my_cmd(...) -> Result<T, String>`.
2. Register it in `invoke_handler(tauri::generate_handler![greet, my_cmd])`.
3. Call from the frontend: `import { invoke } from "@tauri-apps/api/core"` then `await invoke("my_cmd", { someArg })`.

Arg names are **camelCase in JS, snake_case in Rust** — Tauri converts automatically (`{ someArg }` → `some_arg`). Return `Result<_, String>` so errors surface as a rejected promise on the frontend.

## Stack conventions

- **Git operations**: use the **gitoxide (`gix`)** crate, in `ugit-core` — not git2 or shelling out to the `git` CLI.
- **Store**: **SQLite via `rusqlite`** (`bundled` feature — static SQLite, no system lib), in `ugit-core::store`. Not the Tauri SQL/store plugins (those are GUI-runtime-only and the CLI can't use them).
- **Styling**: **Tailwind CSS**.
- **Diff UI**: render diffs with **diffs.com**. **File-tree UI**: render trees with **trees.software**.
- TypeScript is strict (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`); the build fails on unused vars.
- ESM only (`"type": "module"`).
- **Lint/format**: oxlint + oxfmt (the Rust-based oxc toolchain), not ESLint/Prettier. A `PostToolUse` hook auto-runs `oxfmt`/`rustfmt` on edited files.

## Releases (GitHub only)

Distribution is GitHub Releases only, via `.github/workflows/release.yml` (official `tauri-apps/tauri-action`). Push a `v*` tag (e.g. `git tag v0.1.0 && git push origin v0.1.0`) to build per-OS app bundles, standalone CLI binaries, and the updater manifest `latest.json` onto a draft release. The in-app **auto-updater** (`tauri-plugin-updater`) polls `https://github.com/ssnxd/ugit/releases/latest/download/latest.json` (the `endpoints` in `tauri.conf.json`).

**One-time setup before the first release** (user-run, interactive passphrase): `pnpm tauri signer generate -w ~/.tauri/ugit.key`, then paste the public key into `tauri.conf.json > plugins.updater.pubkey` (replacing the `REPLACE_WITH_...` placeholder) and add `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as GitHub repo secrets. Without this, `createUpdaterArtifacts` builds fail.
