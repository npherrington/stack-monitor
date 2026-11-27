# Plan

## What this is

A local page and an MCP server for working across a repo's git worktrees: each checkout's git
state, the dev stack it runs, and the coding agents working in it. From one page you start and stop
a checkout's services, create and remove worktrees, start headless agent runs, put runs on a
schedule, sketch how a feature moves through the stack, keep a board of tickets, and hand a Claude
Code session a ticket to work or a PR to review.

It started inside one private product repo, built around that repo's stack and conventions, where
it still runs. This repo is the generic version. What's particular to a repo is declared in a config
file, and each part of the tool is a module that's on only when the config asks for it. Code comes
across from the original one module at a time, generalised on the way, so nothing here assumes a
particular stack.

macOS first: it reads the machine with `lsof`, `ps -ww` and `docker ps`, and schedules through
launchd.

## Principles

- **Reads, doesn't remember.** Every status read looks at the machine again: git, `ps`, `lsof`,
  `docker ps`. What's kept is what a person wrote and the machine can't be asked for again: the
  tracked repos, schedules, run logs and the ticket board (`docs/decisions/board-sqlite.md`).
- **Refuses what it can't check.** A service whose state can't be read can't be started or
  stopped. A worktree with commits that aren't on mainline, changed files, a session open in it or
  a dev server running isn't offered for removal. A port held by a process outside the checkout is
  never signalled. Stops are SIGTERM, never SIGKILL.
- **Local only.** `node:http` on 127.0.0.1. A request needs a localhost Host, the page's own
  Origin, and a JSON body under a size cap.
- **Runs that spend money start from the page.** The MCP server reads status, starts and stops
  services, and creates and removes worktrees. It never starts an agent run or a schedule: an agent
  that starts unattended agents spends money with nobody deciding.
- **No build step for the server.** `core/`, `server/` and `mcp/` are `.ts` files Node runs
  directly (type stripping). Only the page is built: Vite + React, shadcn on Base UI with Tailwind,
  TanStack Query and React Router (`docs/decisions/`).

## Modules

| Module       | On when                 | What it does                                                                                  |
| ------------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| Worktrees    | always                  | every checkout with its git state; create and remove worktrees                                |
| Stack        | the config has `stack`  | each checkout's services: status, start, stop                                                 |
| Agents       | the config has `agents` | headless runs in a worktree, their logs and reports; schedules                                |
| Feature map  | always                  | a canvas for sketching a feature across the stack                                             |
| Ticket board | always                  | projects, each a board of tickets in columns, with labels, priorities, due dates and comments |

### Worktrees

Needs only git. Lists every worktree of the clone, primary first, with its branch, changed files,
ahead and behind mainline, and whether it's merged. Creates a linked worktree beside the primary
(from an existing branch, a remote one, or a new one cut from mainline) and removes one that's safe
to remove: `git worktree remove`, never `--force`, then `git branch -d`.

What a repo adds, all optional:

- `mainline`: the ref branches are compared against and cut from. Default `origin/main`.
- `setup`: run in a new worktree after `git worktree add`, to write its env files and ports, say.
  A setup that fails takes the worktree back.
- `install`: the dependency install, run in the background once setup is done.
- `teardown`: run before `git worktree remove`, to delete the worktree's containers and data. One
  that fails stops the removal, so a directory never goes while its data stays behind.
- `index`: the file and key that hold a worktree's number, for a repo that gives each worktree its
  own ports. With it, the create form offers only free numbers, and commands and paths can use
  `{index}`.

### Stack

The repo declares its services: a name, the command that starts it, and how the monitor tells it's
up. The command is anything: a mise task, an npm script, a shell script.

How a service's status is read:

- `port`: something listens on the port and works inside the checkout. The port comes from an env
  file key (what `setup` wrote) or `base + index`.
- `compose`: containers whose compose labels point inside the checkout. `parts` names the compose
  services, so one up of two reads as half up.
- `process`: a process whose command line matches, owned by the checkout, by its working directory
  or by a path in its arguments.
- `command`: a command that exits 0 when the service is up, for anything else.

Start runs the command detached, logging to a file, and answers once the status reads up, a `ready`
pattern shows in the log, or, for a `oneShot` command, it exits. `needs` starts another service
first. Stop sends SIGTERM to what the status check found and waits, or runs `stop` when one is
declared. A compose service gets `docker stop`, which keeps its data. `startAll` names what Start
all starts. `shared` lists services one machine runs for every checkout (a local model server, say):
the page shows them and nothing stops them.

### Agents

A run is a headless agent session in one linked worktree. It starts from the page, shows under the
checkout's row while it goes, and ends with its report. A schedule runs one to four steps on a
timetable through launchd, each in the same worktree reset to mainline first.

Everything that differs between agents sits behind an adapter:

```ts
interface AgentAdapter {
  id: string // 'claude'
  label: string
  program: string // looked for on PATH
  models: string[] // offered in the form; any other is typed in
  can: {
    effort: boolean
    cost: boolean
    sessionIdUpFront: boolean
    stages: boolean
  }
  command(run: RunSpec): { program: string; argv: string[] } // headless, unattended
  parse(line: string): RunEvent[] // a log line as common events
  isSession(process: ProcessInfo): boolean // an interactive session open in a checkout
  env(base: Env): Env // the run's environment: what to strip, what to keep
  resume(sessionId: string): string | null // the command the page offers
}
```

A `RunEvent` is text, a tool call, the final report, the session id, an error, or the cost when the
agent reports one. The page shows effort, cost and a workflow's stages only for an adapter that has
them.

The following works the same for every agent:

- the launcher shell, which holds off sleep, runs `install` first in a fresh worktree, and writes
  an `exited` line
- the run's log file
- stopping a run, with SIGTERM to its whole process tree
- the blockers: a run going, a session of any adapter's open, or a dev server up in the checkout

A schedule step is an agent, a model, and a prompt or a saved workflow, plus effort where the agent
takes it. The page breaks each step down that way, with what it cost when the agent says.

Repo settings: the `default` agent; `env`, added to every run (a variable the repo's own tooling
reads as "nobody is watching", say); `arguments`, the patterns an argument is checked against (a
ticket id); and `workflows`, the folder of saved workflows. A saved workflow is a manifest beside
an executable launcher. They're read from git, so listing them runs no workflow code, and each
manifest names its agent.

Claude Code is the first adapter. A second proves the interface (see Open decisions).

A session can start with a task. The page's terminal sessions are interactive `claude` in a
worktree; three buttons start one with its first message already written by the monitor, from ids
and choices the page sends. The one piece of the user's own text in a message is a review's
focus:

- **Work this ticket** (the board): in a new worktree or a checkout you pick, with the board's MCP
  tools. Reading a ticket, moving it and commenting on it run without asking.
- **Product management** (the board): a mode whose system prompt the monitor writes, so it works
  in a repo with no skills. Filing tickets and commenting run without asking; changing or moving
  one asks.
- **Agentic review** (a PR on the GitHub page): in a review worktree the monitor puts at the PR's
  head, detached, or a checkout you pick. Reading the PR through `gh` runs without asking. The
  agent posts one review through `gh`; the monitor never pre-approves that, and posts nothing
  itself. The monitor never checks a fork's PR out: an agent loads the `CLAUDE.md`, skills, hooks
  and settings of the checkout it starts in, so the review worktree stays on the base branch and
  the PR's head is fetched beside it to be read with `git diff` and `git show`. A checkout you
  pick that already sits on a fork PR's commit is refused.

A worktree with `claude` already open refuses a task, since a first message can't be put into a
session that has started. Text a stranger wrote (a PR's title and description) goes into a message
on one line or fenced, and labelled as data. A detached worktree is removed only while a ref holds
its commit, so a commit made in a review worktree isn't lost with it.

### Feature map

A canvas of blocks and arrows, for sketching a feature before anyone writes it, saved as a markdown
file with a Mermaid diagram in it, as a PNG, or as a link. The tool ships generic blocks (web app,
API route, background job, database, cache, queue, external API, auth, LLM, email, file storage,
scheduler) and a few starter maps. A repo's `featureMap.blocks` file adds its own, each with where
its code lives and the docs to read first. An id that matches a built-in replaces it. A `draw`
command lays a map out from a list of pieces and arrows, for an agent to hand a user.

### Ticket board

A board of tickets per project, for planning the work the other modules then do. It belongs to the
person, not to a repo: it reads no checkout, has no section in the config, and is always on.

- A **project** is a board of its own: a name, a colour and a prefix for its tickets' ids. It can
  be archived and restored, or deleted with everything in it.
- A **column** is a status. A new project starts with Backlog, Todo, In progress, In review, Done
  and Cancelled; they can be added, renamed, recoloured, reordered and deleted. Deleting one that
  has tickets asks which column takes them, and a project keeps at least one.
- A **ticket** has a title, a markdown description, a column, labels, a priority, an optional due
  date and comments. Its id is the project's prefix and a number (`BEANS-12`). Numbers count up
  per project and are never given out twice; renaming the prefix renames every id and keeps the
  numbers. The order within a column is the user's: a card stays where it was dropped.
- A **label** is shared by every project or belongs to one. No two labels a project can see share
  a name.

It is kept in one SQLite file, `~/.local/state/stack-monitor/board.db` (`$STACK_MONITOR_BOARD`),
through Node's own `node:sqlite` (`docs/decisions/board-sqlite.md`).

The MCP server (`docs/decisions/mcp-stdio-by-hand.md`) offers the board to an agent:
`board_list_projects`, `board_list_tickets`, `board_get_ticket`, `board_create_ticket`,
`board_update_ticket`, `board_move_ticket` and `board_add_comment`. A ticket is named by its id, a
column or a label by its name. No tool deletes or archives. The two sessions the board starts
(Agents, above) are what use them; the page refreshes the board every few seconds while one is
open.

## Config

One JSON file, parsed with zod, with a JSON Schema exported from it for editor autocompletion. It's
looked for in this order:

1. `$STACK_MONITOR_CONFIG`
2. `stack-monitor.json` at the primary checkout's root
3. `~/.config/stack-monitor/<repo>.json`, for a repo you'd rather not commit it to

A module whose section is left out is off.

```jsonc
{
  "mainline": "origin/main",
  "worktrees": {
    "index": { "file": ".env.worktree", "key": "WORKTREE_INDEX", "max": 99 },
    "setup": "./scripts/setup-worktree.sh",
    "install": "npm ci",
    "teardown": "docker compose -p myapp_wt{index} down --volumes",
  },
  "stack": {
    "services": {
      "db": {
        "start": "docker compose up -d --wait",
        "oneShot": true,
        "status": {
          "compose": {
            "project": "myapp_wt{index}",
            "parts": ["postgres", "redis"],
          },
        },
      },
      "api": {
        "start": "npm run dev:api",
        "needs": ["db"],
        "status": {
          "port": { "file": ".env", "key": "API_PORT", "base": 3000 },
        },
      },
      "worker": {
        "start": "npm run dev:worker",
        "needs": ["db"],
        "ready": "worker ready",
        "status": { "process": { "match": "node dist/worker.js" } },
      },
      "web": {
        "start": "npm run dev:web",
        "status": {
          "port": { "file": ".env", "key": "WEB_PORT", "base": 5173 },
        },
      },
    },
    "startAll": ["db", "api", "worker", "web"],
    "shared": [
      { "name": "Ollama", "url": "http://127.0.0.1:11434/api/version" },
    ],
  },
  "agents": {
    "default": "claude",
    "env": { "MYAPP_UNATTENDED": "1" },
    "arguments": { "ticket": "^[A-Z]+-\\d+$" },
    "workflows": ".claude/workflows",
  },
  "featureMap": { "blocks": "docs/stack-map/blocks.json" },
}
```

## Layout

```
core/
  config/       schema, loader, JSON Schema export
  worktrees/    the clone, checkouts, git state, create, remove
  stack/        services, status checks, start, stop
  agents/       the adapter interface, adapters/claude, runs, run logs
  schedules/    launchd jobs, fires, locks
  feature-map/  blocks, sketch layout, the file format
  board/        the ticket board's SQLite file, projects, columns, labels, tickets, its sessions
  terminals/    claude and shell sessions in a worktree, and the task a session starts with
  github/       a repo's PRs, checks and reviews through gh; the agentic review session
server/         node:http, the route table, the built page
mcp/            stdio MCP server over core/: the board's tools
web/            the page: components/{ui,layouts,pages,<feature>}, hooks, providers, lib
tests/          node:test, against fixture repos
docs/           style-guides, decisions, plans, agents (how the skills use the tracker)
.agents/        agent skills and subagents; .claude/skills and .claude/agents link here
```

## Steps

Each step ends with the tests passing, the page working against a fixture repo, and the original
repo's config (kept in `~/.config`) still giving a working monitor for that repo. Tests come across
with their module, their fixtures rewritten to a generic repo.

0. **Scaffold** (done). `package.json`, tsconfig, eslint, prettier, node's test runner, `mise.toml`
   pinning Node 24, and CI on GitHub Actions. The server with `GET /api/health`, the page's shell,
   and the config loader and schema.
1. **Worktrees.** The clone, checkouts and git state; create and remove with their hooks. The
   Checkouts page; MCP `stack_status`, `stack_create_worktree` and `stack_remove_worktree`.
2. **Stack.** Services with the four status checks, start, stop, Start all and Stop all, and
   compose projects whose checkout is gone. Service chips; MCP `stack_start` and `stack_stop`. The
   biggest step: the original has a fixed list of services and ports, and here they're names from
   the config all the way through the page.
3. **Runs.** The adapter interface and the Claude adapter; the launcher, run files and run logs as
   common events; Run here, View log, Report and Stop run.
4. **Schedules.** launchd jobs that fire from the tool's own folder rather than from inside the
   worktree, fire locks, fire history and notifications. Steps as agent, model and prompt.
5. **Feature map.** Built-in blocks and starters, a repo's blocks merged in, the editor, the file
   format and `draw`.
6. **A second adapter.**
7. **Desktop app (Electron).** The main process starts the server in-process with `startMonitor`,
   which already takes a port and the page's folder from its host, and opens the page in a window.
   The window loads from `http://127.0.0.1:<port>`, so the server's Host and Origin checks hold
   unchanged. The beaver is its Dock icon: `mise run icon` adds a 1024 px PNG and an `.icns` built
   with `iconutil`. A login item starts it, so there's no LaunchAgent for the monitor itself.
   Schedules stay launchd jobs, so they still fire while the app is closed. `mise run dev` stays,
   for running without the app, and the MCP server stays a separate stdio process.
8. **Themes.** The original's light, dark and pastel themes, chosen in the header and remembered
   per browser.

9. **Ticket board.** Projects, columns, labels, tickets and comments in a SQLite file of the
   monitor's own, and the board page: drag a card between columns, filter and search, archive.
10. **Board sessions and agentic review.** The MCP server with the board's tools, and Claude Code
    sessions that start on a ticket, in product management mode, or on a PR review. The `stack_*`
    tools steps 1 and 2 name are still to come.

Keep the clone out of `~/Desktop`, `~/Documents` and `~/Downloads`: macOS keeps launchd jobs out of
those folders, so schedules would fail there.

## Open decisions

- **The second adapter**: Cursor's CLI, OpenCode or Codex. Check each one's current headless flags
  and output format before choosing.
- **Trusting a repo's config.** A committed `stack-monitor.json` names commands the monitor runs
  when you click. Like `mise trust`, the monitor could ask once per file, and again whenever it
  changes, before running any of them.
- **Create a skill / Create a workflow.** The original has pages that start a run to write a new
  agent skill or saved workflow, following that repo's own authoring skills. They're out for now;
  they could come back as an extra of the Claude adapter.
- **A headless run from a ticket.** A ticket starts an interactive session today. Its id already
  matches the `agents.arguments.ticket` pattern a repo can declare, so a ticket could also offer
  the repo's workflows and hand them its id; the run adapters would need the MCP config and
  allowed tools a session gets. A card could show the branch or PR that comes of it.
- **Shipping the app to others.** A download that macOS opens without a warning has to be signed
  with an Apple Developer ID and notarised. Until then it's built from source.
- **Linux.** `lsof` and `ps` work there; schedules and the login job would need systemd user units
  beside launchd.
- **More than one repo per monitor** (built: Settings keeps a list of repos in
  `~/.config/stack-monitor/.monitor.json`, the one thing besides schedules and logs the monitor
  stores). Still open: how create, remove, the stack and agents pick their repo.
