# The ticket board is kept in SQLite, through node:sqlite

**Status:** Accepted — 2026-11

## Context

PLAN.md's first principle is that the monitor reads and doesn't remember: every status is read off
the machine again, and the only things kept were the tracked repos, schedules and run logs. The
ticket board is the first feature whose data a person wrote. No command can read a ticket back, so
it has to be stored.

What it stores is relational: projects, each with its columns, tickets, labels and comments. A
ticket's number comes from a counter that must never hand out the same number twice, a card's
place in a column changes with its neighbours', and deleting a project has to take everything of
its own and nothing else. Those have to change together or not at all.

## Decision

**SQLite, through Node's built-in `node:sqlite` (`DatabaseSync`).** One file,
`~/.local/state/stack-monitor/board.db`, or the file `$STACK_MONITOR_BOARD` names. `core/board/`
opens it for one read or one write and closes it again, so nothing holds it between requests and a
broken file is read afresh once it's fixed. The tables are `STRICT`, the schema is versioned with
`PRAGMA user_version` and a list of migrations, and every write is one transaction.

The board is always on and has no section in `stack-monitor.json`: it belongs to the person, not
to a repo. This repo's own work stays in GitHub Issues (`tickets-github-issues.md`); the board is
a feature for the user's projects.

## Alternatives rejected

- **MongoDB in a Docker container**: Docker has to be up, and the container started, before the
  board loads, and the monitor would have to say why it isn't. It adds a driver dependency for
  data that fits in one small file.
- **Running the whole monitor in Docker**: it reads the host (`ps`, `lsof`, `docker ps`, git
  worktrees, launchd) and opens terminals on it. In a container it would see the container.
- **A JSON file, as `schedules.json` is**: every write rewrites the whole file, and the numbering,
  the ordering and the cascades would be code here rather than the database's.
- **GitHub Issues through `gh`**: needs a repo and a network, the issues are public, and it has no
  per-project columns or manual order.
- **The browser's `localStorage`**: one browser only (the Electron window and a browser tab would
  each have their own board), lost with the site's data, and out of reach of a later MCP tool or a
  workflow started from a ticket.
- **`better-sqlite3`**: a second native module to rebuild for Electron beside `node-pty`, for what
  Node already ships.

## Consequences

- "Reads, doesn't remember" has a named exception. PLAN.md § Principles now lists what is kept:
  what a person wrote and the machine can't be asked for again.
- The board is one file to back up or copy to another machine. Deleting a ticket or a project is
  permanent: there is no export yet.
- A file written by a newer monitor refuses to open in an older one, and the page says so. From
  here on a change to the tables is a new migration, never an edit to a shipped one.
- `node:sqlite` is not yet marked stable in Node 24. It loads without a warning in the pinned
  24.21.0 (`mise.toml`) and in Electron 45.5; an older 24 release, which `package.json`'s `engines`
  admits, may print one to stderr.
- `core/board/schema.ts` is Node-free and the page imports it, so it is listed in
  `tsconfig.web.json` and in `mise.toml`'s build sources beside `core/types.ts`.
