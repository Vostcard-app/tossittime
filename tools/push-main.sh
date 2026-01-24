#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

npx tsc -b --noEmit

git add -A

MSG="${1:-}"
if [ -z "$MSG" ]; then
  echo "ERROR: Missing commit message."
  exit 2
fi

if git diff --cached --quiet; then
  echo "No staged changes to commit."
else
  git commit -m "$MSG"
fi

git push origin main
