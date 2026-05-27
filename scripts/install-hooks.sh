#!/bin/sh
# One-shot setup: point git at .githooks/ and make the hooks executable.
set -e

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "x not inside a git repo. run 'git init' first." >&2
  exit 1
}

cd "$repo_root"

chmod +x .githooks/commit-msg 2>/dev/null || true
git config core.hooksPath .githooks

echo "ok git hooks wired:"
echo "  core.hooksPath = $(git config core.hooksPath)"
echo ""
echo "  commit-msg -> blocks Claude/Anthropic attribution"
