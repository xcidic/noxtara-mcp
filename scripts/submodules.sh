#!/bin/sh
# Check out all git submodules (.gitmodules). Safe to run repeatedly.
# Run manually when needed, e.g. after clone: ./scripts/submodules.sh
# Or: git clone --recurse-submodules …

set -e

# Resolve repo root (directory containing .git or git worktree root).
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$ROOT" || exit 1

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "submodules: not a git checkout; skipping submodule init" >&2
  exit 0
fi

echo "submodules: updating submodules..."
git submodule update --init --recursive
echo "submodules: done"
