# stack-monitor

<img src="public/icon-512.png" alt="" width="96" align="right" />

A local page and MCP server for working across a repo's git worktrees: each checkout's git state,
the dev stack it runs, and the coding agents working in it.

**Status: early.** The scaffold is in: the server, the config file and its schema, and a page that
shows which modules a repo's config turns on. Worktrees, the stack, agent runs, schedules and the
feature map come next, in the order [PLAN.md](PLAN.md) gives. It will ship as a desktop app
(Electron); until then it runs as a local server you open in a browser.

## Install

It runs on macOS. You need git and [mise](https://mise.jdx.dev), which installs the Node it pins.

```sh
brew install mise                  # or: curl https://mise.run | sh
git clone https://github.com/npherrington/stack-monitor.git ~/code/stack-monitor
cd ~/code/stack-monitor
mise trust                         # mise asks before running a new repo's mise.toml
mise run dev                       # installs, builds the page, serves http://127.0.0.1:7420
```

Clone it outside `~/Desktop`, `~/Documents` and `~/Downloads`. macOS keeps background jobs out of
those folders, and the monitor's schedules and login job will run as launchd jobs from its folder.

**Point it at your repo.** Unset, it serves the repo it runs from, this one. For yours:

```sh
STACK_MONITOR_REPO=~/src/myapp mise run dev   # any checkout of the repo, or a folder inside one
STACK_MONITOR_PORT=7430 mise run dev          # another port, 1024 to 65535
```

**Put it in the Dock.** Open the page in Safari and choose File > Add to Dock. It gets the beaver as
its icon and opens in a window of its own. That window shows the running server, so start `mise run
dev` first; until the desktop app comes, nothing starts the server at login.

**Update.** `git pull`, then `mise run dev` again: it installs and rebuilds what changed.

The server answers only on 127.0.0.1, and only requests whose Host is `127.0.0.1` or `localhost`
on its port.

## Configure a repo

A repo says what it runs in `stack-monitor.json`. The monitor looks for it in this order:

1. the file `STACK_MONITOR_CONFIG` names
2. `stack-monitor.json` at the root of the repo's primary checkout
3. `~/.config/stack-monitor/<primary checkout's directory name>.json`, for a repo you'd rather not
   commit it to (`$XDG_CONFIG_HOME` is respected)

With no file at all, the defaults apply: worktrees and the feature map are on, stack and agents
off. [`examples/node-postgres.json`](examples/node-postgres.json) uses every section. Point
`$schema` at [`schema/stack-monitor.schema.json`](schema/stack-monitor.schema.json) for completion
and hover docs in your editor:

```json
{
  "$schema": "https://raw.githubusercontent.com/npherrington/stack-monitor/main/schema/stack-monitor.schema.json"
}
```

## Develop

```sh
mise run check               # everything CI runs: eslint, prettier, tsc, actionlint, shellcheck, tests, the page build
mise run test                # tests/, with Node's own test runner
mise run format              # prettier --write
mise run schema              # rewrite the JSON Schema after changing core/config/schema.ts
mise run icon                # redraw the beaver into public/ after changing scripts/draw-icon.ts
mise run worktree -- try-1   # a linked worktree beside this one, to give the monitor more checkouts
```

`mise run worktree -- <branch>` checks out a local branch, tracks one that's only on origin, or
cuts a new one from a freshly fetched `origin/main`. The worktree lands beside the primary checkout
as `stack-monitor-<branch>`, with its dependencies installed. It prints how to serve and remove it.

`core/`, `server/` and `mcp/` are `.ts` files that Node runs directly by stripping their types, so
only the page (`web/`, React + Vite) is built.

## License

[MIT](LICENSE)
