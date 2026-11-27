# Feature: Update from main… in the desktop app

## Overview

There's a menu item in the app menu, after About. It checks the app's own checkout from inside the
app. It refuses, or says "already up to date", without quitting. Otherwise it asks the user to
confirm, hands off to a detached script, and quits. The script waits for the app to exit, then
fast-forwards main, installs packages, builds, reinstalls the launcher only if it changed, and
reopens the app. Nothing touches `node_modules` while the app runs. No route, page change or MCP
tool.

## Files

- **`app/update.ts`** (new, no `electron` import so tests can load it). `readUpdateState(root)`
  runs git through `run` (`core/run.ts`): `symbolic-ref --short -q HEAD`, `status --porcelain`
  (file names), `GIT_TERMINAL_PROMPT=0 fetch --quiet origin main` (30 s timeout),
  `rev-list --left-right --count HEAD...origin/main`, `rev-parse origin/main`,
  `log --oneline HEAD..origin/main` (up to 10 lines), and `mise --version` (is mise on PATH).
  `decideUpdate(state)` is pure and returns
  `{ kind: 'refuse', message } | { kind: 'current' } | { kind: 'ready', target, commits }`. It
  refuses when the checkout isn't on `main` (names the branch, or says detached), has changed
  files (names up to 10), can't fetch (git's message), has commits ahead of origin/main, or
  can't find mise. `behind === 0` is `current`.
- **`app/main.ts`**. `Menu.setApplicationMenu` with the default roles (`appMenu` written out so
  the item goes after About, then `fileMenu`, `editMenu`, `viewMenu`, `windowMenu`). The item is
  disabled while a check runs. `refuse` and `current` show a `dialog.showMessageBox` and change
  nothing. `ready` confirms ("N new commits", the log lines, "Stack monitor quits, updates and
  reopens; its terminals close"). On OK it spawns `/bin/bash scripts/update-app.sh <target>
<process.pid> [watcher.pid]` with `detached: true, stdio: 'ignore'`, calls `unref()`, then
  `app.quit()`. `will-quit` still sends SIGTERM to the vite watcher. The single-instance lock
  goes when the process exits, and the script waits for that.
- **`scripts/update-app.sh`** (new, shaped like `scripts/worktree.sh`). The body is a `main()`
  called on the last line, so bash has parsed all of it before the merge rewrites the file.
  There's no mise task, since only the app runs it.
- **`scripts/install-app.sh`**. The launcher exports `STACK_MONITOR_APP=<the .app path>`, so the
  app knows it was opened from the launcher, whose root is this checkout because it `cd`s there.

## The update script

1. Write output to `~/Library/Logs/Stack monitor/update.log`, overwritten on each update but not
   when the app starts. Log each step with a heading.
2. Check every pid given with `kill -0` every 0.2 s, for up to 30 s. If one is still alive, show
   an alert ("didn't quit, nothing was updated") and exit. Nothing is ever signalled.
3. Check again that the checkout is on main and has no changes. If not, alert, reopen and exit.
4. `old=$(git rev-parse HEAD)`, then `git merge --ff-only <target>`. This uses the commit the
   dialog showed, so there's no second fetch, and `--ff-only` never makes a merge commit.
5. `mise run build`, which runs `sync` (`npm ci`) first through its `depends`.
6. Only when `STACK_MONITOR_APP` is set and
   `git diff --quiet "$old" HEAD -- scripts/install-app.sh public/icon-dock.png` fails:
   `mise run install-app`. Otherwise the launcher only runs `mise run app` in the checkout, so
   new code needs no reinstall. Rewriting the bundle when nothing changed (`rm -rf`,
   `lsregister`) only puts the Dock entry at risk.
7. If `STACK_MONITOR_APP` is set, `open "$STACK_MONITOR_APP"`. If it isn't (the app was started
   with `mise run app` from a terminal), show an alert: "Updated to <sha>. Start it again with
   mise run app in <root>."

PATH: the app inherits the launcher's baked PATH (or the terminal's), and the script inherits
the app's, so `git` and `mise` resolve the same way they did for the app. The in-app check has
already proved mise is there.

## Failure handling

The `osascript` alert matches the launcher's. It names the step and the log path, and shows the
log's last 8 lines.

- Failure at steps 2–3: nothing changed. Step 2 doesn't reopen, since the app never quit. Step 3
  reopens the old version.
- Failure at step 4 (merge) or later: the alert has **Open Stack monitor** and **OK** buttons.
  Opening runs the launcher's `mise run app`, which reruns `sync` and `build`. That is the
  recovery, along with `cd <root> && mise run build` (or `mise run install-app` when step 6
  failed), which the alert names. Nothing is ever deleted and reinstalled.

## Tests

- `tests/app-update.test.ts`, new, against `cloneWithOrigin` (`tests/fixtures.ts`), with the
  primary on main level with origin. It runs `readUpdateState` and then `decideUpdate` for each
  case: current; one commit pushed from a second worktree gives `ready` with that target; a
  branch checked out is refused and named; a changed file is refused and named; a local commit
  ahead is refused; a broken `origin` URL is refused as a failed fetch.
- By hand: `mise run lint:scripts`, then in the installed app: the up-to-date dialog, the dirty
  refusal, and a real update that reopens the app with its Dock icon. A forced failure (a bad
  `package.json` on a test commit) should show the alert, leave `update.log` in place, and
  recover through Open Stack monitor. Also an update from a terminal-started `mise run app`.
- The first update after this merges is done by hand, with the app quit, because the installed
  launcher has no `STACK_MONITOR_APP` yet.

## Config & Contract

No config, route, type or MCP change. A new kept file, `update.log`, is the update's run log
(PLAN.md § Principles: "the only things kept are schedules … and run logs"). Nothing is
signalled: the app quits itself, and the vite watcher gets SIGTERM as it does today ("Stops are
SIGTERM, never SIGKILL"). The script refuses to update a checkout it can't check again.

## Verification Checklist

- [ ] Off main or with changes: a dialog names the branch or files, and nothing changes
- [ ] Up to date: a dialog, and the app keeps running
- [ ] An update reopens the app with its icon, and `install-app` runs only when its inputs changed
- [ ] A failed step leaves `update.log` and an alert, and Open Stack monitor recovers
- [ ] `mise run check` passes

## Open questions

- Should a launcher opened mid-update (from Spotlight or the Dock) be blocked? Two `npm ci` runs
  could overlap. Recommend not for now: the confirm dialog says not to open the app until it
  reopens. Blocking it would take a pid file that the launcher checks.
- Should the script run `git merge --ff-only <target>` or `git pull --ff-only` as asked?
  Recommend the merge: it installs exactly what the dialog showed and needs no second network
  call.
