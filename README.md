# uGIT

**A diff-focused git client built for the agent era.**

uGIT is a desktop app *and* a CLI that puts the diff at the center of your workflow. Instead of treating diffs as a side view of commits, uGIT makes them the primary object you compare, review, comment on, and hand off to agents.

## Why uGIT

In an agent-driven workflow, the diff is the unit of collaboration between you and your tools. uGIT is built around that idea:

- **Any diff you want.** Compare branch-to-branch, worktree-to-worktree, commit-to-commit, or any pair of refs. If you can name two states of the repo, uGIT can diff them.
- **Comment on changes.** Annotate diffs inline. Your comments are attached to the diff, not lost in a chat window or a PR thread.
- **Built for agents.** Export your comments and feedback in a structured form an agent can act on — turn a review into a task.
- **One tool, two surfaces.** Everything is available both in the desktop UI and from the terminal via the CLI.

## Desktop app

Open a repository (folder picker or a recent repo), choose **left** and **right** refs from the
branch / tag / commit pickers, and hit **Diff**. The file tree shows what changed; the main pane
renders a syntax-highlighted diff. Hover any line and click the **+** to comment on that exact
change — comments render inline and in the side panel. Pick any Shiki theme; the whole app
re-themes. Keyboard-first: `j`/`k` between files, `c` comments, `s` split/unified, `o` switch repo,
`?` for the full shortcut list.

## CLI

The CLI mirrors the desktop app over the **same store**, so anything you do in one shows up in the
other. It's built for piping diffs and review feedback into agents.

```sh
# Diff two refs. Prints a stable diff-id (line 1) + a --stat-style listing.
ugit diff <left> <right> [--repo .] [--kind ref-to-ref]

#   …as a git-style unified patch:
ugit diff HEAD^ HEAD --format patch

#   …as structured JSON (files → hunks → lines, with line numbers):
ugit diff HEAD^ HEAD --format json

# List recent diffs with comment counts (discover diff-ids).
ugit diffs [--repo <path>] [--limit 20] [--format table|json]

# Attach a comment — general, or anchored to a file/line/side.
ugit comment-add <diff-id> --body "Looks off here" --file src/lib.rs --line 42 --side right

# Export every comment on a diff for an agent to act on (JSON or Markdown).
ugit comment <diff-id> --format json

# Open an existing diff back in the desktop app (deep link).
ugit open <diff-id>
```

### Agent workflow

```sh
# 1. You (or an agent) produce a diff and capture its stable id.
id=$(ugit diff main feature --repo ~/code/app | head -1)

# 2. Review it — in the desktop app (`ugit open "$id"`) or via comment-add.
# 3. Hand the review to an agent as structured feedback:
ugit comment "$id" --format md
```

Because both surfaces share one SQLite store, comments made in the GUI are exactly what
`ugit comment` exports — the review is the unit of collaboration.

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

# Checks (all green on main)
pnpm build                 # type-check + build the frontend
pnpm lint                  # lint with oxlint
pnpm test                  # frontend test suite (Vitest)
cargo test --workspace     # core + CLI tests
cargo clippy --workspace   # Rust lints
cargo fmt --check          # Rust formatting
pnpm format                # format the frontend with oxfmt
```

### Releasing

Push a version tag to build and publish to GitHub Releases:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

This runs `.github/workflows/release.yml` (per-OS app bundles, standalone CLI binaries, and the `latest.json` updater manifest). First-time setup requires generating updater signing keys — see [CLAUDE.md](./CLAUDE.md#releases-github-only).

See [CLAUDE.md](./CLAUDE.md) for architecture and contribution conventions.
