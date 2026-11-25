---
name: code-base-scanner
description: Trace how a symbol, route, config key, type or flow moves through this repo (config, core module, server route, page, MCP tool) and explain it as a walkthrough plus an ASCII flow diagram. Read-only. Use when asked how X is used, to trace the flow of X, where X comes from or goes, or to understand a path across layers before touching it.
---

# Trace Flow

Given a thing (a config key like `worktrees.setup`, a route like `GET /api/config`, a type in
`core/types.ts`, a core function, a page hook, an env var like `STACK_MONITOR_PORT`, a mise task),
find every place it appears, work out how information moves between those places, and **walk a
teammate through it at the whiteboard**: a plain-spoken walkthrough plus an ASCII flow diagram.

The deliverable is understanding, the kind you'd get from a colleague who knows the code. Read-only.

## When to use vs other skills

| Goal                                       | Use             |
| ------------------------------------------ | --------------- |
| How is X used, where does it flow          | this skill      |
| Find bugs in a diff                        | `code-review`   |
| Check a plan against the code it would hit | `plan-iterator` |

"Find the one file where X is defined" is a plain search: grep and answer. Reach for this skill when
the answer spans **more than one layer** and the user wants the _path_, not a location.

## Input

One subject, usually an identifier or a short phrase. If it matches several unrelated things, say so
up front, list the candidates, and trace the most likely one, or ask which.

## The repo's layers (the map you trace along)

```
stack-monitor.json            what a repo declares; examples/ has one using every section
core/config/schema.ts         its zod schema → schema/stack-monitor.schema.json (mise run schema)
core/config/load.ts           where the file is looked for and how it's read
        │
        ▼
core/<module>/                what the monitor does: worktrees/ now; stack/, agents/,
                              schedules/, feature-map/ as PLAN.md's steps land
core/run.ts                   every git, ps, lsof, docker call goes through run()
        │
        ├──────────────► mcp/   stdio MCP tools over core/ (planned, PLAN.md step 1)
        ▼
server/routes.ts              "METHOD /path" → handler; route() parses input with zod
server/http.ts                Host, Origin and Content-Type checks before any route runs
        │  JSON, typed by core/types.ts
        ▼
web/lib/                      the page's fetch (web/lib/api.ts)
web/hooks/ → web/components/  TanStack Query hooks, then pages/ and <feature>/ components
tests/                        node:test against fixture repos (tests/fixtures.ts)
```

Rules of thumb:

- **`core/types.ts` is the seam.** It's the one core file the page imports (`tsconfig.web.json`'s
  include), so a shape the server answers with and the page reads lives there. A rename shows up on
  both sides of it.
- **core/ has two callers.** The server and the MCP server both sit over it, so a core function's
  sinks can be a page and an agent's tool call.
- A **config key** flows _down_: schema → loader → the core module that reads it → the route →
  the page that shows it. A **page identifier** flows _up_ to the route it fetches, then into core.
- **Reads, doesn't remember** (PLAN.md): most flows start at the machine (git, `ps`, `lsof`,
  `docker ps`, launchd), not at a store. When a value seems to come from nowhere, look for the
  `run()` call.
- A layer PLAN.md names but the tree doesn't have yet is a gap, not a hit: say it's planned.

## Workflow

### 1. Scope the subject

Build the spelling variants before searching. One concept here is a camelCase identifier, a
kebab-case file name, a JSON key, a `"METHOD /path"` string, an `STACK_MONITOR_*` env var and a mise
task: `featureMap` → `feature-map`, `featureMap.blocks`, `"featureMap"`, "feature map".

### 2. Fan out the search (breadth first)

Cast wide across every layer at once. When the surface is large, delegate the sweep to parallel
`Explore` agents in one message, one per area:

- `core/`
- `server/` and `mcp/`
- `web/`
- `tests/`
- config and tooling: `schema/`, `examples/`, `mise.toml`, `scripts/`, `.github/workflows/`

Each agent's job: "find every reference to `<variants>` in `<area>`; report file:line and a one-line
note on what each does (definition, read, write, pass-through, display)." For a small subject, run
`rg` yourself: match effort to surface.

### 3. Classify each hit

- **origin**: where the value is declared or first produced (a config key, a git command's output)
- **transform**: parsed, validated, mapped, renamed, computed from
- **transport**: crosses a boundary (an HTTP route, an MCP tool, a spawned process)
- **sink**: the final consumer (shown on the page, drives a refusal, signals a process, logged)
- **store**: kept on disk, which here is rare: schedules and run logs only (PLAN.md)

This is what turns a pile of grep hits into a _flow_.

### 4. Order into a path

Chain the hits from origin to sink(s). Note branches (one origin, several sinks) and any link you
couldn't resolve.

### 5. Output

Two parts, in this order.

**a) Walkthrough.** Explain it the way you would to a teammate who rolled their chair over and asked
"how does this actually work?"

- Tell it as a story: where the value comes from, each hop, where it ends up. "So the page never
  reads the config file itself. The route reads it fresh on every request, which is why an edit
  shows on the next reload without a restart."
- Conversational and plain: contractions, second person, short sentences.
- Drop the `file:line` inside the sentence as you go, the way you'd point at a line on a shared
  screen: "that's `core/config/load.ts:81`, see how a missing file falls through to the defaults
  but a missing `STACK_MONITOR_CONFIG` target is a problem."
- Call out the "huh, interesting" moments as asides: two sources of truth, a rename mid-flow, a
  check the page does that the server doesn't, a planned layer the flow will pass through later.
- A few short paragraphs. No headers, no summary label, no inventory of hits.

**b) Flow diagram.** "Here's the rough shape of it": an ASCII diagram of the path across layers,
readable in a terminal, with edges annotated with what moves. The shape:

```
core/config/load.ts:81   loadConfig()            ← origin: stack-monitor.json, or the defaults
        │  { ok, path, config }
        ▼
core/config/schema.ts:333   modulesOf()          which modules the config turns on
        │
        ▼
server/routes.ts:12   readConfigStatus()  →  'GET /api/config'
        │  JSON, typed as ConfigStatus (core/types.ts:33)
        ▼
web/lib/api.ts:2   getJson()
        │
        ▼
web/…   the module list                          ← sink: on / off per module
```

Fan it out for several sinks, collapse it for a short path. Mark an unverified step `(?)` and a
planned layer `(planned)` rather than drawing a confident line.

End with one casual line on what you looked through and what you left out ("only dug through core
and the server, didn't open the tests"), so a silent gap doesn't read as "nothing there."

## Voice

Two engineers talking at a desk. Contractions, "so", "the catch is", "notice that". Every concrete
claim carries its `file:line`, inline. Start explaining straight away, and get to the point.

## Constraints

- **Read-only.** If the trace turns up a bug, flag it in one line and point at `code-review`.
- **No invented links.** When two hits don't connect, say the trail goes cold there: an honest gap
  beats a fabricated edge.
- **Match effort to surface.** A constant in two files gets `rg`; a concept threaded through every
  layer gets the fan-out.
- **Trace, don't dump.** Raw hit lists stay in your scratch work.
- **No subject given:** ask what to trace. **One file, no flow:** answer plainly and say this
  skill's machinery is overkill.
