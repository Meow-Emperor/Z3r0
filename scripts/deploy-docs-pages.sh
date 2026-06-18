#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
DOCS_DIR="$ROOT_DIR/docs"
DIST_DIR="$DOCS_DIR/.vitepress/dist"
PAGES_REMOTE="origin"
PAGES_BRANCH="gh-pages"
PAGES_WORKTREE="/tmp/z3r0-pages"
COMMIT_MESSAGE="docs: deploy github pages"

created_worktree=0

cleanup() {
  local status=$?
  if [[ "$created_worktree" -eq 1 ]]; then
    git worktree remove "$PAGES_WORKTREE" --force >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT

if [[ -e "$PAGES_WORKTREE" ]]; then
  echo "Worktree path already exists: $PAGES_WORKTREE" >&2
  echo "Remove it and rerun this script." >&2
  exit 1
fi

echo "Building VitePress docs..."
(
  cd "$DOCS_DIR"
  npm run docs:build
)

touch "$DIST_DIR/.nojekyll"

echo "Preparing $PAGES_BRANCH worktree..."
if git ls-remote --exit-code --heads "$PAGES_REMOTE" "$PAGES_BRANCH" >/dev/null 2>&1; then
  git fetch "$PAGES_REMOTE" "$PAGES_BRANCH"
  git worktree add --detach "$PAGES_WORKTREE" "FETCH_HEAD"
else
  git worktree add --detach "$PAGES_WORKTREE" HEAD
  git -C "$PAGES_WORKTREE" switch --orphan "$PAGES_BRANCH"
fi
created_worktree=1

echo "Replacing worktree contents with build output..."
git -C "$PAGES_WORKTREE" rm -rf . >/dev/null 2>&1 || true
find "$PAGES_WORKTREE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$DIST_DIR"/. "$PAGES_WORKTREE"/

git -C "$PAGES_WORKTREE" add -A

if git -C "$PAGES_WORKTREE" diff --cached --quiet; then
  echo "No documentation changes to deploy."
  exit 0
fi

git -C "$PAGES_WORKTREE" commit -m "$COMMIT_MESSAGE"
git -C "$PAGES_WORKTREE" push "$PAGES_REMOTE" "HEAD:$PAGES_BRANCH"

echo "Published docs to $PAGES_REMOTE/$PAGES_BRANCH."
