#!/usr/bin/env bash
# `mise run worktree -- <branch>`: a linked worktree of this repo beside the primary checkout, so
# the monitor has more than one checkout to show. A local branch is checked out, a branch only on
# origin is tracked, and any other name is cut from a freshly fetched origin/main. Then its
# mise.toml is trusted and its dependencies installed, so `mise run dev` works there at once.
set -euo pipefail

branch=${1:-}
if [ -z "$branch" ]; then
  echo "usage: mise run worktree -- <branch>" >&2
  exit 2
fi
if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  echo "\"$branch\" isn't a branch name git takes" >&2
  exit 2
fi

# The primary is the first worktree git lists, whichever checkout this runs from.
primary=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
dir="$(dirname "$primary")/$(basename "$primary")-$(printf '%s' "$branch" | tr '/' '-')"
if [ -e "$dir" ]; then
  echo "$dir already exists" >&2
  exit 1
fi

# No credential prompt: a fetch that needs one fails, and the worktree comes from origin as it was
# last fetched.
if ! GIT_TERMINAL_PROMPT=0 git fetch --quiet origin; then
  echo "git fetch origin failed, so origin/main is as it was last fetched" >&2
fi

if git show-ref --verify --quiet "refs/heads/$branch"; then
  git worktree add --quiet "$dir" "$branch"
elif git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  git worktree add --quiet --track -b "$branch" "$dir" "origin/$branch"
else
  git worktree add --quiet --no-track -b "$branch" "$dir" origin/main
fi

mise trust --quiet "$dir/mise.toml"
(cd "$dir" && mise run sync)

echo "Made $dir on $branch."
echo "Serve it: cd $dir && STACK_MONITOR_PORT=7430 mise run dev"
echo "Remove it: git worktree remove $dir && git branch -d $branch"
