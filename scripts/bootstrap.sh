#!/usr/bin/env bash
# devilge bootstrap — installs Node (via Homebrew if missing), installs deps,
# builds, lints, and runs the test suite. All output goes to bootstrap.log so
# Claude (or any reviewer) can read it back without rerunning.
#
# Usage:  bash scripts/bootstrap.sh

set -uo pipefail

# Resolve the project root from the script location so the script works from
# any clone, in CI, or via an absolute path. `realpath -m` is portable across
# macOS coreutils + GNU coreutils.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="$PROJECT_DIR/bootstrap.log"

# Truncate the log and tee everything to it.
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

echo "==> devilge bootstrap @ $(date)"
echo "==> shell: $SHELL"
echo "==> arch:  $(uname -m)"
echo

# ---------------------------------------------------------------------------
# Make sure Homebrew's binaries are on PATH (matters on Apple Silicon).
# ---------------------------------------------------------------------------
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

echo "==> PATH: $PATH"
echo

# ---------------------------------------------------------------------------
# Step 1: ensure node + npm.
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "==> node not found — installing via Homebrew"
  if ! command -v brew >/dev/null 2>&1; then
    echo "ERROR: Homebrew is not installed. Install it from https://brew.sh first." >&2
    exit 1
  fi
  brew install node
else
  echo "==> node already installed: $(node --version)"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is missing even after node install." >&2
  exit 1
fi

echo "==> node:  $(node --version)"
echo "==> npm:   $(npm --version)"
echo

# ---------------------------------------------------------------------------
# Step 2: install deps.
# ---------------------------------------------------------------------------
cd "$PROJECT_DIR"
echo "==> installing dependencies"
npm install --no-audit --no-fund || { echo "ERROR: npm install failed"; exit 1; }
echo

# ---------------------------------------------------------------------------
# Step 3: build.
# ---------------------------------------------------------------------------
FAILED_STEPS=()

echo "==> typecheck"
npm run typecheck || FAILED_STEPS+=("typecheck")
echo

echo "==> build"
npm run build || FAILED_STEPS+=("build")
echo

# ---------------------------------------------------------------------------
# Step 4: lint.
# ---------------------------------------------------------------------------
echo "==> lint"
npm run lint || FAILED_STEPS+=("lint")
echo

# ---------------------------------------------------------------------------
# Step 5: tests.
# ---------------------------------------------------------------------------
echo "==> tests"
npm test || FAILED_STEPS+=("tests")
echo

if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
  echo "==> done. dist/index.js is at: $PROJECT_DIR/dist/index.js"
  exit 0
else
  echo "==> finished with failures in: ${FAILED_STEPS[*]}"
  exit 1
fi
