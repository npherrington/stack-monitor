---
name: kata
description: Set the user a small coding exercise (one function, one hook, one component, one task or job) drawn from the patterns this repo uses (Node TypeScript with type stripping, zod, node:test, React with TanStack Query, shadcn and cva, mise, GitHub Actions), let them write it in a gitignored scratch directory, then review it by reading it, never running it, against how this codebase does it. Keeps a per-session history so it doesn't repeat. Use when asked for a coding exercise, coding practice, to set me a problem, or to drill a rusty area.
---

# Kata

Set one exercise. The user writes real code in a scratch directory. When they say they're done, read
what they wrote, tell them honestly whether it works, and show them how this repo solves the same
problem.

Sibling of `quiz-me`: that one tests whether they know how the code works, this one whether they can
write it.

## Where things live

Everything lives under this skill's own directory, gitignored by `.agents/skills/kata/.gitignore`:

```
.agents/skills/kata/
  training/2026-09-01-1150-zod-repo-path/   # one directory per exercise
    BRIEF.md                                # you write this
    solution.ts                             # you stub it, they fill it in
  history/2026-09-01-1150.md                # one file per session
```

It all stays uncommitted where it is, and you read only this user's own.

Get directory and file names from `date +%Y-%m-%d-%H%M`.

## Running a session

### 1. Read the history, pick a track

```bash
grep -h '^## \|^\*\*Exercise:\*\*' .agents/skills/kata/history/*.md 2>/dev/null | tail -30
ls -t .agents/skills/kata/history/*.md 2>/dev/null | head -2
```

Set something new each time. Push toward tracks they haven't done, and back toward ones they
struggled with.

If they named a track or a difficulty, honour it. Otherwise pick at random:

```bash
awk 'BEGIN{srand()} {a[NR]=$0} END{print a[int(rand()*NR)+1]}' <<'EOF'
node
zod
node-test
react
mise
github-actions
EOF
```

### 2. Write the brief

**Keep it small.** One function, one hook, one small component, one route handler, one mise task,
one workflow job. Five to fifteen minutes of typing. A brief that needs two "and"s is two exercises:
set the first one.

"Write a function that turns `git worktree list --porcelain` into objects" is a kata; "build the
Checkouts page" isn't. Small and finished beats big and abandoned, and a small one gets a proper
review instead of a survey.

Self-contained: one file, no running monitor, nothing imported from the repo. Where a repo type would
be imported, put a stub definition at the top of the starter file so they have something real to
type against. A third-party import the repo already depends on (`zod`, `react`,
`@tanstack/react-query`, `class-variance-authority`) is fine.

`BRIEF.md` has four parts and nothing else:

```markdown
# <one-line title>

## The problem

<two or three sentences. concrete. name the inputs and the expected output>

## Constraints

- <anything that rules out the lazy answer: "erasable syntax only, so Node can strip the types",
  "never rejects", "the caller may pass an empty string">

## Done when

- <checkable statements, not vibes. "returns [] for empty output" beats "handles edge cases">

## Not part of this

- <what they can skip, so they don't gold-plate: logging, tests, styling>
```

Then write the starter file next to it: imports, the stub definitions, and the signature with a
`TODO`. The body stays empty: a half-written one tells them the approach and removes the exercise.

For the `node`, `zod` and `node-test` tracks the file is `.ts` held to what Node's type stripping
runs (`tsconfig.node.json` sets `erasableSyntaxOnly`): no `enum`, no `namespace`, no parameter
properties, and relative imports with their `.ts` extension. Say so under Constraints; it's part of
writing code for this repo.

Tell them the path and stop. They write, you wait.

### 3. While they're working

**Hints only when asked.** Sitting with it is the exercise. When they ask, give one rung at a time
and stop:

1. **Name the concept** they're missing. "That effect needs a dependency array." "This wants
   `safeParse`, not `parse`."
2. **Give the shape**: the signature, the option, which library call does it. No body.
3. **Scaffold the file.** They've hit something they've never written ("I don't know how
   `node:test` sets up a fixture"): that's a gap in knowledge, not effort, and staring at a blank
   file doesn't fix it.

**Scaffolding, concretely.** Edit their file directly (or create it) and leave a skeleton of
comments and pseudo-code that shows the _structure_ without doing the thinking:

```ts
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

describe('readPort', () => {
  const saved = process.env.MY_PORT // before() changes it, so after() puts it back
  before(() => {
    // 1. set the env var the function reads
  })
  after(() => {
    // 2. restore it: delete when it was unset, assign when it wasn't
  })

  test('rejects a padded value', () => {
    // 3. call it, then assert.deepEqual on what comes back
  })
})
```

Real syntax for the part they didn't know, numbered comments for the part they're meant to work
out. The loop, the condition, the parse stay theirs: the moment you write them, the exercise is
over.

Say what you scaffolded and hand it straight back.

If they ask outright for the answer, give it, explain it, and log the exercise as unfinished rather
than a pass.

**Scaffolding on request is the only edit this skill makes to their work.** Typos, fixes and the
review all stay out of their file.

### 4. Review what they wrote

**Read it; leave it unrun.** No `node`, `npm`, `tsc`, `mise run`, `act` or installs. Executing a
fifteen-minute exercise costs more than the exercise, and the mise and Actions tracks would mean
running tasks and workflows on the user's machine to mark a homework answer.

Trace it by hand instead, properly: take the inputs from "Done when" and walk them through the code
line by line, the empty case and the failure path included. That's the review. Say plainly that you
read it.

**Judge it, hardest thing first:**

| Pass                    | Looking for                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Does it work            | Trace it against "Done when". Name the input that breaks it, if one does                                                               |
| Edge cases              | Empty input, a missing field, undefined, the promise that rejects, the child process that never starts                                 |
| Is it the right shape   | An `await` in a loop that could be one `Promise.all`; a `useEffect` doing a query's job; `parse` that throws where a result was wanted |
| Does it match this repo | Not "would I write it this way": does it match `docs/style-guides/` and the code around it                                             |

If it works, say so plainly and move to the comparison; criticism is for what's actually wrong. If
it's broken, say what's broken and the input that proves it, before anything about style.

### 5. Show how this repo does it

This is the part they keep. Find the real equivalent and read it with them:

- The file:line where this codebase solves the same problem.
- What it does that theirs doesn't, and why: the constraint that shaped it (read to the end of an
  oversized body because the client is still sending; digits only because `Number()` also takes
  `1e4`).
- What theirs does _better_, if anything. It happens, and saying so is how they learn the difference
  between a rule and a habit.

If the repo has no equivalent, say so. Where the code isn't there yet but a guide in
`docs/style-guides/` describes the pattern, compare against the guide.

### 6. Record it

Append to this session's history file:

```markdown
## zod / a path inside the checkout: medium

**Exercise:** a schema for a relative path that can't climb out with ..
**Outcome:** worked, but rejected `a..b` too: split on `/` before looking for `..`
**Gap:** the repo's version is `RepoPath` (core/config/schema.ts:18), a refine over the split path
**Next time:** zod again, harder: a strictObject whose two fields are both optional but not both
```

Four lines, written after the review.

### 7. Next

Ask if they want another. Keep the same session file for the whole sitting.

## Exercise bank

Seeds drawn from what this repo does. Write a specific brief from one; don't paste the line.

**node** (`core/`, `server/`)

- A wrapper over `execFile` that never rejects: a missing program or a timeout comes back as code -1
  with the reason (`core/run.ts:19`).
- Parse `git worktree list --porcelain` into `{ path, locked, prunable }` blocks
  (`core/worktrees/clone.ts:35`).
- Read a port from an env string: unset means the default, digits only, 1024 to 65535
  (`core/monitor-address.ts:22`).
- Read a request body to its end under a byte cap, answering a value or an error
  (`server/http.ts:83`).
- Resolve a URL path inside a root directory and refuse one that climbs out (`server/static.ts:51`).
- Replace an `enum` with an `as const` array and the union derived from it (`core/types.ts:23`).

**zod** (`core/config/schema.ts`, `server/http.ts`)

- A string schema for a path inside the checkout: relative, no `..` segment
  (`core/config/schema.ts:18`).
- A string that must compile as a regular expression (`core/config/schema.ts:46`).
- A `route()`-style wrapper: `safeParse` the input, and turn the first issue into a 400 that names
  the field (`server/http.ts:32`).
- Describe the first five issues of a failed parse, then "and N more" (`core/config/load.ts:50`).

**node-test** (`tests/`)

- Tests for a port parser's edge cases (`1e4`, `0x1F90`, `" 7420"`) with `node:test` and
  `assert/strict` (`tests/monitor-address.test.ts`).
- A `before`/`after` pair that deletes an env var for the suite and puts it back exactly as it was
  (`tests/routes.test.ts`).
- A fixture that makes a temporary git repo with one commit (`tests/fixtures.ts`).

**react** (`web/`)

- A TanStack Query hook for `GET /api/config`, with its query key, over a stubbed `getJson`
  (`docs/style-guides/react-data-fetching.md`).
- A mutation that invalidates the list it changed, and a button that can't send it twice while it's
  pending.
- A status chip whose variants come from props through `cva`, not `className` overrides
  (`web/components/ui/`, `docs/style-guides/react-components.md`).
- A react-hook-form form with a zod resolver for a new branch name, showing the error under the
  field (`docs/style-guides/react-forms.md`).
- A component that shows a run's log lines as text, however much markup an agent put in them.

**mise** (`mise.toml`)

- A task that skips when its inputs haven't changed, using `sources` and `outputs` (`sync`,
  `build`).
- A gate task that `depends` on four others and runs a last command after them (`check`).
- A task that passes its extra arguments through to a script (`worktree`).

**github-actions** (`.github/workflows/ci.yml`)

- A `concurrency` group that cancels a PR's superseded runs but never one push to main with the
  next.
- A job with read-only `permissions` that installs its tools from a lockfile and runs one gate.
- A job that runs lint and tests and reports both even when lint fails, still failing the job.
- Path filters so a change under `web/` alone skips a job that only covers `core/`.

When a track's real home is still empty (no `web/hooks/` yet, say), compare against the style guide
or say there's nothing to compare against yet.

## Difficulty

All three sizes are small: difficulty is the constraint, not the volume of code.

- **Easy**: one function, one behaviour, no I/O. "Keep the lines of this output that start with
  `worktree `."
- **Medium**: async, one external call, or state; one real edge case to get right. The default.
- **Hard**: a constraint that rules out the obvious answer: never rejects, cancel-safe, survives
  being called twice at once. Still one function.

Move up when they pass cleanly, down when they don't finish.

## Constraints

- **Scaffold only when asked, and only with comments and pseudo-code.**
- **Their attempt comes first.** The solution appears in no brief, stub or "reference" before they've
  tried.
- **Small exercises.** One function, one hook, one component, one task, one job.
- **The repo is read-only.** The only things this skill writes are `BRIEF.md`, the starter stub and
  the history file, all under `.agents/skills/kata/`.
- **One exercise at a time.**
- **Read, never execute,** and never claim otherwise.
- **Self-contained exercises.** One that needs the monitor running, a fixture repo or a browser is
  the wrong exercise for this skill.

## Voice

- Set the problem like a colleague handing over an issue: what's needed, what done looks like.
- Review like a peer: direct about what's broken, specific about where, generous with the
  explanation after.
- Say what's right, then what isn't, with no praise for participating.
- Plain language. Name the actual thing.
