#!/usr/bin/env bash
# Build the `ugit` CLI and stage it as a Tauri sidecar.
#
# Tauri's `externalBin` resolves a sidecar by appending the target triple to the
# configured name, e.g. `binaries/ugit` -> `src-tauri/binaries/ugit-aarch64-apple-darwin`.
# This script produces exactly that file so `tauri dev`/`tauri build` can bundle it.
#
# Usage:
#   scripts/stage-sidecar.sh                 # build for the host triple
#   scripts/stage-sidecar.sh <target-triple> # build for a specific triple (CI)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/src-tauri/binaries"

# Resolve the target triple: explicit arg, or the host's default.
TRIPLE="${1:-$(rustc -vV | sed -n 's/^host: //p')}"

EXT=""
case "$TRIPLE" in
  *windows*) EXT=".exe" ;;
esac

echo "Building ugit CLI for $TRIPLE ..."
# `--target` keeps host and cross builds in predictable per-triple output dirs.
cargo build --release -p ugit-cli --target "$TRIPLE"

mkdir -p "$DEST"
SRC="$ROOT/target/$TRIPLE/release/ugit$EXT"
OUT="$DEST/ugit-$TRIPLE$EXT"
cp "$SRC" "$OUT"
echo "Staged sidecar: $OUT"
