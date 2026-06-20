# uGIT

**A diff-focused git client built for the agent era.**

uGIT is a desktop app *and* a CLI that puts the diff at the center of your workflow. Instead of treating diffs as a side view of commits, uGIT makes them the primary object you compare, review, comment on, and hand off to agents.

## Why uGIT

In an agent-driven workflow, the diff is the unit of collaboration between you and your tools. uGIT is built around that idea:

- **Any diff you want.** Compare branch-to-branch, worktree-to-worktree, commit-to-commit, or any pair of refs. If you can name two states of the repo, uGIT can diff them.
- **Comment on changes.** Annotate diffs inline. Your comments are attached to the diff, not lost in a chat window or a PR thread.
- **Built for agents.** Export your comments and feedback in a structured form an agent can act on — turn a review into a task.
- **One tool, two surfaces.** Everything is available both in the desktop UI and from the terminal via the CLI.

## CLI

The CLI mirrors the desktop app so you can stay in the terminal and pipe diffs and feedback into your agents.

```sh
# Export all comments on a diff as JSON or Markdown
ugit comment <diff-id>
```

`ugit comment <diff-id>` returns a JSON or Markdown file containing every comment on the given diff — ready to feed to an agent so it can pick up your feedback and act on it.

## Status

This README describes the **product vision**. uGIT is under active development; the features above describe the intended experience, not a guarantee of what is already implemented.

## Architecture

ugit is a **Cargo workspace** so the desktop app and CLI share one brain:

- `crates/ugit-core` — all domain logic (git/diff via `gix`, the SQLite store, types). No Tauri.
- `crates/ugit-cli` — the `ugit` command-line binary; a thin shell over core.
- `src-tauri` — the Tauri desktop app; also a thin shell over core.

Both surfaces open **the same SQLite database** (`ugit.db` in the OS app-data dir), in WAL mode for concurrent access — so a comment you make in the GUI is what `ugit comment <diff-id>` exports in the terminal.

## Tech stack

- **Tauri v2** (Rust backend) + **React 19** + **TypeScript** + **Vite**
- Git operations powered by **gitoxide (`gix`)**; storage via **SQLite (`rusqlite`)**
- Styled with **Tailwind CSS**
- Distributed via **GitHub Releases** with in-app auto-updates (`tauri-plugin-updater`)
- Package manager: **pnpm**

## Development

```sh
pnpm install               # install frontend dependencies
cargo build                # build all crates (core, cli, app)

# Desktop app
./scripts/stage-sidecar.sh # build + stage the CLI sidecar (run before tauri dev/build)
pnpm tauri dev             # run the full desktop app (Vite + Rust window)

# CLI
cargo run -p ugit-cli -- diff main HEAD
cargo run -p ugit-cli -- comment <diff-id> --format md

# Checks
pnpm build                 # type-check + build the frontend
pnpm test                  # frontend test suite (Vitest)
cargo test -p ugit-core    # store tests
pnpm lint                  # lint with oxlint
pnpm format                # format with oxfmt
```

### Releasing

Push a version tag to build and publish to GitHub Releases:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

This runs `.github/workflows/release.yml` (per-OS app bundles, standalone CLI binaries, and the `latest.json` updater manifest). First-time setup requires generating updater signing keys — see [CLAUDE.md](./CLAUDE.md#releases-github-only).

See [CLAUDE.md](./CLAUDE.md) for architecture and contribution conventions.
