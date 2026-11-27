# The MCP server speaks the protocol itself, over stdio

**Status:** Accepted — 2026-11

## Context

Sessions the monitor starts from the ticket board need to read and write tickets: a session
working a ticket moves it and comments on it, and a product management session files new ones. The
agent in those sessions is a CLI (Claude Code first), and what a CLI agent takes for typed tools
with per-tool permission rules is an MCP server it starts itself and talks to over stdio.

PLAN.md has named `mcp/` since the start as "a stdio MCP server over core/". The monitor's own
server is `node:http` with no framework, and the board took `node:sqlite` over a driver to stay
dependency-free. What `mcp/` has to serve is small: tools only, no resources, prompts or sampling.

## Decision

**`mcp/` is a stdio server written by hand**, with no SDK. The wire format is newline-delimited
JSON-RPC 2.0, and a tools-only server answers four requests (`initialize`, `ping`, `tools/list`,
`tools/call`) and ignores notifications.

- `mcp/protocol.ts` is pure: one line of stdin in, the line to answer with out. It holds the
  protocol versions the server knows and the JSON-RPC errors.
- `mcp/board-tools.ts` holds the tools. Each has a zod input schema, turned into the JSON Schema
  the protocol wants by zod 4's `z.toJSONSchema`, and calls the same `core/board/` function the
  matching route calls.
- `mcp/main.ts` reads stdin by line and writes answers to stdout. Nothing else goes to stdout.

Claude Code starts it from a config the monitor passes to each session (`core/mcp-launch.ts`):
this Node, the absolute path of `mcp/main.ts`, and the board file to open.

## Alternatives rejected

- **`@modelcontextprotocol/sdk`**: at 1.32.2 it has 17 direct dependencies, among them express,
  hono, cors, jose and ajv, for the four requests above. They would be the first web framework in
  a tool whose server is `node:http` on purpose, and each is a package to audit and keep current.
- **MCP over the monitor's own HTTP server**: every request there must carry a localhost Host and
  the page's Origin. A second kind of client would need a guard of its own (a token, say), and a
  session would depend on the monitor's port.
- **A command the agent runs through its shell** (`stack-monitor board add …`): works with any
  agent, but the agent parses text, and a shell rule can't allow "read a ticket" while still
  asking for "move a ticket".
- **Having the agent end with a block the monitor parses**: fits a one-shot headless run, not a
  conversation that files tickets as it goes.

## Consequences

- No new npm dependency. The protocol code is ours to keep right: a new protocol version is one
  entry in a list, checked against the agent CLIs the monitor launches.
- Resources, prompts, sampling or an HTTP transport would each be written here, or reopen this
  choice in a new record.
- A second process now opens the board's file while the monitor runs. `core/board/` already
  allows for it: the file is opened per call, every write is one transaction, and a writer waits
  up to two seconds for the lock.
- The tools' names and inputs are a contract from here on: the sessions' permission rules and the
  skills name them.
- Verified against Claude Code 2.1.332, which probes `server/discover` first and falls back to
  `initialize` when that is answered "method not found".
