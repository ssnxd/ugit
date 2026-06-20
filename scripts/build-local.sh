#!/usr/bin/env bash
# Produce a signed local release build of the ugit desktop app.
#
# Does the two things a bare `pnpm tauri build` can't do on its own:
#   1. loads the updater signing secrets from a gitignored `.env`
#      (Tauri's CLI does not read .env files itself), and
#   2. stages the `ugit` CLI sidecar so `externalBin` resolves.
#
# Usage:
#   scripts/build-local.sh            # build for the host
#   scripts/build-local.sh --debug    # any extra args pass through to `tauri build`
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 1. Load signing secrets. `set -a` exports everything sourced from .env.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "error: TAURI_SIGNING_PRIVATE_KEY is not set." >&2
  echo "       Copy .env.example to .env and fill in your key path + passphrase." >&2
  exit 1
fi

# 2. Stage the CLI sidecar for the host triple.
"$ROOT/scripts/stage-sidecar.sh"

# 3. Build + sign.
echo "Building signed release bundle ..."
pnpm tauri build "$@"
