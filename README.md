# stack-monitor

A local page and MCP server for working across a repo's git worktrees: each checkout's git state,
the dev stack it runs, and the coding agents working in it.

**Status: early.** The scaffold is in: the server, the config file and its schema, and a page that
shows which modules a repo's config turns on. Worktrees, the stack, agent runs, schedules and the
feature map come next, in the order [PLAN.md](PLAN.md) gives.

## Run it

It needs [mise](https://mise.jdx.dev), which installs the pinned Node.

```sh
mise run dev                                       # this repo, on http://127.0.0.1:7420
STACK_MONITOR_REPO=~/src/myapp mise run dev        # another repo: any checkout of it, or a folder inside one
STACK_MONITOR_PORT=7430 mise run dev               # another port, 1024 to 65535
```

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
mise run check     # everything CI runs: eslint, prettier, tsc, actionlint, tests, the page build
mise run test      # tests/, with Node's own test runner
mise run format    # prettier --write
mise run schema    # rewrite the JSON Schema after changing core/config/schema.ts
```

`core/`, `server/` and `mcp/` are `.ts` files that Node runs directly by stripping their types, so
only the page (`web/`, React + Vite) is built.

## License

[MIT](LICENSE)
