---
name: implement
description: Implementation discipline for this repo. The map from the area of code you're touching (the page's components, hooks, providers and fetch layer; core, server and mcp; tests, scripts, workflows and hooks) to what to read first, the gate to run and the review to expect. Use when starting to write or change code, when asked to "implement X", or when the edit-time hook points you here. Read the area section before editing; it is the source of truth the PreToolUse hook routes to.
---

# Guide Router

The plan-first cycle and the explain-as-you-go discipline live in CLAUDE.md
§ Development Cycle. This skill is the **routing map**: given the area of code
you're about to touch, what to read _before_ writing, and what reviews it
_after_. The edit-time hook (`.claude/hooks/implement-context.sh`) injects a
pointer to the matching section here by area name (`web-components`,
`web-hooks`, `web-providers`, `web-lib`, `web`, `core`, `server`, `mcp`,
`tests`, `scripts`, `workflows`, `hooks`). This file is what it points at, so
keep the map current here and the hook stays dumb: a new or renamed section
changes the hook's `case` in the same edit.

## How to use

1. Identify the area from the file path (sections below; each heading starts
   with the area name the hook uses).
2. Read everything listed for that area, each file in full, **before** writing
   the code, not after. Whole files only: never through `head` or any truncation.
3. Implement per the plan, narrating non-obvious choices as you go.
4. Run `comment-trimmer` on the diff to strip any verbose or explanatory
   comments the implementation left behind.
5. Run what CLAUDE.md § When to Run Tests lists for the files you changed, and
   get it green. Review is CLAUDE.md § Development Cycle step 4, at the weight
   picked: `skeptical-code-reviewer` runs `style-guide-check` and each area's
   **Review after** itself.

One change can span areas (a route, the core function it calls and their
test): read every section it touches. A path that matches no section: read the
closest area's list and flag the gap per Constraints.

## The page (`web/`)

Guides only exist for the page so far. Every `web-*` area reads
`docs/style-guides/react-hooks.md` and `docs/style-guides/react-data-fetching.md`
on top of its own list, because any file there can hold a hook or reach for
data. And in any of them:

- Building or changing a form (a field and a submit): also
  `docs/style-guides/react-forms.md`.
- Telling the user an action worked or failed: also
  `docs/style-guides/react-toasts.md`.

**Quality gate:** `mise run lint && mise run build`.
**Check:** lint, tsc and the build can't catch stale state or a wrong target,
so look at the change running. `mise run dev` (in the background) builds the
page and serves it on `http://127.0.0.1:7420`; in a linked worktree, pass
`STACK_MONITOR_PORT=7430` (or another free port) so it doesn't meet the
primary's monitor. Open it in a browser (the Claude in Chrome tools, say). It
serves the built page, so rerun it after each change.
**Review after:** `style-guide-check` and `frontend-security-coder`.

### `web-components`: `web/components/**`, the page's components

**Read first:** `docs/style-guides/react-components.md` (which of `ui/`,
`layouts/`, `pages/` or a feature folder a component lives in, and what it
does there). `web/components/ui/` holds the shadcn primitives
(`components.json`); check there before writing a control.

### `web-hooks`: `web/hooks/**`, the page's hooks

**Read first:** the two every `web-*` area reads; `react-data-fetching.md` is
the one that decides how a hook runs a query or a mutation.

### `web-providers`: `web/providers/**`, `web/contexts/**`, `web/app.tsx`, `web/main.tsx`

**Read first:** `docs/style-guides/react-providers.md` (a context and its
provider, and the provider tree `web/app.tsx` mounts).

### `web-lib`: `web/lib/**`, the fetch layer and helpers

**Read first:** `docs/style-guides/react-data-fetching.md`, which covers the
fetch layer in `web/lib/api.ts`. The shapes a route answers with come from
`core/types.ts`, the one core file the page imports (`tsconfig.web.json`); a
new shape goes there, not in `web/`.

### `web`: the rest of `web/`, plus `index.html`, `vite.config.ts`, `components.json`

`web/router.tsx` (the hash router), `web/index.css` (the theme's tokens) and
the build config. **Read first:** `docs/style-guides/react-components.md`, and
`docs/decisions/` for the choice behind the file you're changing
(`routing-hash-router.md`, `ui-shadcn-base-ui-tailwind.md`,
`page-vite-react.md`).

## The server side (`core/`, `server/`, `mcp/`)

There's no style guide for these yet (CLAUDE.md § Style Guides). **Read
first**, for all three: PLAN.md § Principles, the PLAN.md § Modules section
for the module you're in, and the files beside the one you're changing. The
neighbouring code is the convention; copy its shape. What applies to all
three:

- **Type stripping.** Node runs the `.ts` files as they are, so only erasable
  syntax (`erasableSyntaxOnly`): no `enum`, `namespace` or constructor
  parameter properties. Imports name the `.ts` file (`'../run.ts'`), and a
  type-only import is `import type`.
- **Commands** go through `run` in `core/run.ts`, a program and an argv
  array, never a shell string built from input. It never rejects, so check
  its `code`.
- **Output** goes to stderr: stdout is the MCP protocol stream
  (`eslint.config.js`).

**Quality gate:** `mise run test && mise run lint`.
**Review after:** no review skill yet: `skeptical-code-reviewer` checks the
change against PLAN.md § Principles itself.

### `core`: `core/**`, the modules

The principles that live here: **Reads, doesn't remember** (each status read
looks at the machine again; only schedules and run logs are kept) and
**Refuses what it can't check** (a service whose state can't be read isn't
started or stopped; SIGTERM, never SIGKILL; `git worktree remove`, never
`--force`; a process outside the checkout is never signalled). A repo's
particulars come from its config, never from a literal here.
`core/types.ts` imports nothing from Node, because the page imports it.
Changing `core/config/schema.ts`: also `mise run schema` and commit the
rewritten `schema/stack-monitor.schema.json`, and keep
`examples/node-postgres.json` loading (a test reads it). A field made
required, narrowed or removed breaks every repo that committed a
`stack-monitor.json`: that's Full weight, so raise it before writing it.

### `server`: `server/**`, the HTTP server and its routes

**Local only**: `server/http.ts` listens on 127.0.0.1 and refuses a request
without a localhost Host, the page's own Origin, or a JSON body under
`MAX_BODY_BYTES` (`server/routes.ts`); a new route keeps all three. A route is
an entry in `makeRoutes` keyed `'<VERB> /api/<path>'` that calls into
`core/`, where the logic lives so `mcp/` can call the same function. Every
route answers JSON, a refusal included (`failure` in `core/types.ts`), since
the page reads anything else as the monitor being down.

### `mcp`: `mcp/**`, the stdio MCP server

A tool calls the same `core/` function the matching route does. **Runs that
spend money start from the page**: a tool reads status, starts and stops
services, and creates and removes worktrees, and never starts an agent run or
a schedule.

## The rest of the gate (`tests/`, `scripts/`, workflows, hooks)

What reviews these is `mise run check`, so the gate is the area's own part of
it. **Review after:** none beyond the reviewer's read.

### `tests`: `tests/**`, node's test runner

**Read first:** `tests/fixtures.ts` (fixture repos in a temp directory, with
real `git`) and the test file beside the one you're adding. A test of a core
module runs against a fixture repo, not a mock of git. The type-stripping
rules above apply here too (`tsconfig.test.json`).
**Quality gate:** `mise run test && mise run lint`; one file is
`node --test tests/<file>.test.ts`.

### `scripts`: `scripts/**`, the dev scripts

**Read first:** `scripts/worktree.sh` for the shell shape (`set -euo
pipefail`, a usage line, errors to stderr). A `.ts` script runs under Node's
type stripping like `core/`. A script someone runs by hand gets a
`[tasks.<name>]` with a `description` in `mise.toml`, as `worktree` and
`icon` have.
**Quality gate:** `mise run lint:scripts` for `.sh`, `mise run lint` for `.ts`.

### `workflows`: `.github/workflows/**`

CI runs `mise run check` and nothing else, so a local pass is a CI pass. A new
check is a mise task under `check`, not a workflow step, and a new tool is
pinned in `mise.toml`'s `[tools]` (and `mise.lock`).
**Quality gate:** `mise run lint:workflows`.

### `hooks`: `.claude/hooks/**`, `.claude/settings.json`

A hook reads its PreToolUse payload as JSON on stdin and stays quiet unless it
has something to say. Keep it executable, and test it by piping a sample
payload in (`printf '%s' '{"tool_input":{...}}' | .claude/hooks/<hook>.sh`).
`implement-context.sh`'s `case` and this file's section names change together.
**Quality gate:** `mise run lint:scripts`.

## Constraints

- Read the list **before** the first edit in an area, not as a post-hoc check.
- The review skills are read-only: they surface findings; you apply fixes.
  `comment-trimmer` is the exception: it edits, but only comments on lines the
  diff touched, and shows the plan before cutting.
- A listed guide that doesn't exist, or a quality gate that fails, stops the
  step: report it, don't skip it.
- A pattern no guide or principle covers: flag it (CLAUDE.md § Style Guides,
  suggest a guide) rather than inventing a convention.
