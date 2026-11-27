#!/usr/bin/env bash
# Run detached by the app's "Update from main…" (app/main.ts), once the app has checked that its
# checkout is a clean main behind origin/main. Waits for the app to quit, fast-forwards main to
# <commit>, installs and builds, reinstalls the launcher when its inputs changed, then reopens the
# app. Nothing runs while the app does: `npm ci` replaces the Electron the app runs from.
# Usage: update-app.sh <commit> <pid>...   (the app, its vite watcher and its launcher)
set -euo pipefail

name="Stack monitor"
log="$HOME/Library/Logs/$name/update.log"
wait_tries=150 # 0.2 s apart: 30 s

# An alert with an optional second button; prints the button pressed. The text goes in as argv so
# nothing in it needs quoting for AppleScript.
alert() {
  osascript - "$@" <<'APPLESCRIPT'
on run argv
  if (count of argv) > 2 then
    set answer to display alert (item 1 of argv) message (item 2 of argv) buttons {"OK", item 3 of argv} default button 2
    return button returned of answer
  end if
  display alert (item 1 of argv) message (item 2 of argv)
  return ""
end run
APPLESCRIPT
}

reopen() {
  if [ -n "${STACK_MONITOR_APP:-}" ]; then
    open "$STACK_MONITOR_APP"
  fi
}

# Before the merge: nothing changed, so the old version opens again.
refuse() {
  echo "$1"
  alert "$name wasn't updated" "$1" >/dev/null || true
  reopen
  exit 1
}

# After the merge: the checkout is on the new commit but a step didn't finish.
failed() {
  local step=$1 retry=$2
  local text
  text="$step failed, so $name is on the new commit but may not start. Its log: $log
To finish by hand: cd $root && $retry

$(tail -n 8 "$log")"
  if [ -n "${STACK_MONITOR_APP:-}" ]; then
    if [ "$(alert "$name didn't finish updating" "$text" "Open $name" || true)" = "Open $name" ]; then
      # The launcher's mise run app reruns sync and build.
      reopen
    fi
  else
    alert "$name didn't finish updating" "$text" >/dev/null || true
  fi
  exit 1
}

main() {
  if [ "$#" -lt 2 ]; then
    echo "usage: update-app.sh <commit> <pid>..." >&2
    exit 2
  fi
  local target=$1
  shift
  root=$(cd "$(dirname "$0")/.." && pwd)
  mkdir -p "$(dirname "$log")"
  exec >"$log" 2>&1
  echo "Updating $root to $target"

  echo "== waiting for the app to quit"
  local pid tries
  for pid in "$@"; do
    tries=0
    while kill -0 "$pid" 2>/dev/null; do
      if [ "$tries" -ge "$wait_tries" ]; then
        echo "process $pid is still running after 30 s"
        alert "$name wasn't updated" "Process $pid was still running 30 s after $name quit, so nothing changed. Open $name again once it has gone." >/dev/null || true
        exit 1
      fi
      sleep 0.2
      tries=$((tries + 1))
    done
  done

  cd "$root"
  echo "== checking the checkout again"
  local branch
  branch=$(git symbolic-ref --short -q HEAD || true)
  if [ "$branch" != main ]; then
    refuse "$root is on ${branch:-a detached HEAD} now, not main, so nothing changed."
  fi
  if [ -n "$(git status --porcelain)" ]; then
    refuse "$root has changed files now, so nothing changed."
  fi

  echo "== git merge --ff-only $target"
  local old
  old=$(git rev-parse HEAD)
  if ! git merge --ff-only "$target"; then
    refuse "main couldn't fast-forward to $target, so nothing changed. Its log: $log"
  fi

  # build depends on sync, so npm ci runs first when package-lock.json changed.
  echo "== mise run build"
  mise run build || failed "mise run build" "mise run build"

  # The launcher only runs mise run app here, so new code needs no reinstall; rewriting the bundle
  # for nothing only puts its Dock entry at risk.
  if [ -n "${STACK_MONITOR_APP:-}" ] &&
    ! git diff --quiet "$old" HEAD -- scripts/install-app.sh public/icon-dock.png; then
    echo "== mise run install-app"
    mise run install-app || failed "mise run install-app" "mise run install-app"
  fi

  echo "== updated to $(git rev-parse --short HEAD)"
  if [ -n "${STACK_MONITOR_APP:-}" ]; then
    reopen
  else
    # Also what a launcher installed before STACK_MONITOR_APP existed gets.
    alert "$name updated" "It's on $(git rev-parse --short HEAD). Start it again with mise run app in $root. If you open it from the Dock or Spotlight, run mise run install-app there once, so the next update reopens it." >/dev/null || true
  fi
}

# The merge writes a new file and bash keeps reading the old one, but exit on the same line means
# nothing after main is read either way.
main "$@"; exit
