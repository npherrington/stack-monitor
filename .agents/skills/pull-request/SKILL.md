---
name: pull-request
description: Write a pull request title and body from the current branch's diff. Use when asked to write or draft the PR text (returns title + markdown body, nothing pushed), or to open the PR (runs `gh pr create --draft`).
---

# Pull Request Writer

The body is the reviewer's **map**: read before the diff, in under a minute, it says what the
change is for and where each piece of it sits. The reasoning, rules and edge cases stay where they
already are: the plan, the code and the tests. The repo is public, so the body is also what a
stranger reads to learn what changed.

Every name in the body is one the diff contains. State an assumption as one when something is
unclear.

## Workflow

### 1. Read the branch

The base is `main` unless the user names another target (e.g. a long-running feature branch).

```bash
git fetch origin
git status
git branch --show-current
git log origin/<base>..HEAD                  # commits on this branch, full messages
git diff origin/<base>...HEAD --stat         # files + line counts
git diff origin/<base>...HEAD                # actual changes
```

From the diff, collect what the map is made of:

- **Server**: the `core/` modules and the functions they export, routes in `server/routes.ts`, MCP
  tools in `mcp/`, config fields in `core/config/schema.ts`, shapes in `core/types.ts`, the
  commands and signals the change sends to the machine
- **Page**: routes in the hash router (`web/router.tsx`), pages, feature components and what renders what,
  `web/components/ui/` primitives used or added, data hooks and the `web/lib/api.ts` calls they make
- **For a person to act on**: a config change that breaks an existing `stack-monitor.json`, a
  changed MCP tool, a changed style guide, a new dependency, a deleted test

**Done when** every changed file under `core/`, `server/`, `mcp/` and `web/` is either on the map
or left off on purpose: a test, the regenerated `schema/stack-monitor.schema.json`, a mechanical
edit.

### 2. Compose the PR

Write the title (§ Title) and the body (§ Body).

### 3. Open it (only if asked)

If the user said "open the PR" / "create the PR" / "push and PR":

1. Push if not already pushed: `git push -u origin <branch>`. If the push is
   rejected, stop and report it; reconciling (pull, rebase, force) is the
   user's call.
2. Write the body to `<scratchpad>/pr-body.md` and run
   `gh pr create --draft --assignee @me --base <base> --title "<title>" --body-file <scratchpad>/pr-body.md`
   (`@me` assigns the PR to whoever opens it)
3. Save what GitHub now holds, not the file you sent (the round trip adds a
   trailing newline):
   `gh pr view <number> --json body --jq .body > <scratchpad>/pr-<number>-body.md`.
   It's the record of what this session last posted, which the existing-PR
   check below diffs against. Do the same after every `gh pr edit --body-file`.
   No scratchpad path in the system prompt: skip the file and compare by eye.
4. Return the PR URL

**Default to a draft PR** (`--draft`): it gets marked ready when CI is green
and the author has self-reviewed. Only drop `--draft` (open as
ready-for-review) when the user explicitly says "ready", "not a draft", "open
it for review", or similar.

If the user said "write" / "draft me a description" / "give me a PR body",
just return the text: do not push, do not run `gh pr create`. ("Draft" can
mean either "write the text" or "open a draft PR"; when it's ambiguous,
return the text without opening.)

## Title

`<type>(<scope>): <what changed>`, under 70 characters, no trailing period:

- `feat(worktrees): remove a worktree that's safe to remove`
- `fix(stack): read a port held on ::1 as up`
- `refactor(page): one query per checkout row`
- `chore(ci): pin actionlint`

`<type>` is one of `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, matching the branch's
prefix (`create-branch`). `<scope>` is the module (`worktrees`, `stack`, `agents`, `schedules`,
`feature-map`, `config`, `mcp`) or area (`page`, `server`, `ci`, `skills`), in PLAN.md's word
for it.

## Body

```
<summary>

## Server             when core/, server/ or mcp/ changed

## Page               when web/ changed

Testing: <one line>

## Review notes       when a person has something to act on

<!-- claude-session: ... -->
```

`EXAMPLE.md` beside this file is a body with both sections filled in. Read it before writing a
body with a Server or Page section.

### Summary

Two or three sentences in plain words: what someone can now do, or what was broken, and where
they'd meet it (the page, an MCP tool, a config field). End with `Closes #<n>` when the PR finishes
an issue (GitHub closes it on merge), `Part of #<n>` when it doesn't.

A change with neither section below (docs, CI, skills, hooks, scripts) follows the summary with up
to five one-line bullets of what changed, then Testing. That is its whole body.

### Server: the map

The layers in the order the change builds up: Config, Core, Routes, MCP, Also. Leave out a layer
the PR doesn't touch, and within a layer list only what's new or changed. The map scales down: a
fix to one function is `## Server` and one line.

```
## Server

**Config** · `core/config/schema.ts` · new section `<name>`      (or: new fields on `<section>`)

| Field | Type | Notes |
| --- | --- | --- |
| `<field>` | `<type>` | <what it holds; its default; whether an existing config still loads> |

**Core** · `core/<module>/`
- `<file>.ts`: `<function>` <what it does>; `<function>` <what it does>

**Routes** · `server/routes.ts`

| Route | Does | Refuses | Takes → returns |
| --- | --- | --- | --- |
| `<VERB> /api/<path>` | <what it does> | <what it won't do, and what it answers then> | `<Body>` → `<Shape>` in `core/types.ts` |

**MCP** · `mcp/<file>.ts` · `<tool>` <what it does, and what it refuses>

**Also** · `<script, mise task, dependency>` <what it does>
```

- **Config**: every field of a new section, or the fields added or changed on an existing one.
  Name the regenerated `schema/stack-monitor.schema.json` only when it's the only trace of a change.
- **Core**: one line per file, each function with a clause. Name a command it runs or a signal it
  sends ("`git worktree remove`, never `--force`").
- **Routes**: one row per new or changed route. **Refuses** is what PLAN.md § Principles makes it
  refuse ("a worktree with changed files, else 409"). When every row shares one, say it once
  after the file name and keep the column for what differs.
- **MCP**: one line per new or changed tool.
- **Also**: whatever the layers above lean on that's new, one line each.

### Page: the layout

Where the change sits in the page, from the router down to the primitives.

````
## Page

**Route** · `#/<path>` in `router.tsx`, under `<Layout>` · <how someone gets there>

**Components**
```
<Page>                    pages/<file>.tsx       +  <hook it reads>
├─ <FeatureComponent>     <feature>/             +  <hook it reads>
│  └─ <FeatureComponent>  <feature>/             ~
└─ <FeatureComponent>     <feature>/
```

**UI** · `<Primitive>`, `<Primitive>`; added to `ui/`: `<Primitive>`
**Data** · `<useThing>` (`<VERB> /api/<path>`), `<useThingMutation>` (<what it changes>)
````

- **Route**: the hash path, the layout it nests under, and how someone reaches it: a nav link (name
  the nav), pushed from another page (name the control), or no new route (name the page it lives
  in).
- **Components**: one tree per page, down to the feature components. `+` is new, `~` is changed,
  unmarked is an existing parent shown for context. The second column is the folder under
  `web/components/`; a hook the component reads goes at the end of its line.
- **UI**: the shadcn primitives the new and changed components render, naming any this PR added
  to `ui/`.
- **Data**: each new or changed data hook with the route it calls.

### Testing

One line: the commands run, with counts, and what was looked at in the page. A gate that didn't
run is named as not run.

### Review notes

Only what the reviewer, or someone running the monitor, has to act on: a config change that
breaks an existing `stack-monitor.json`, a changed MCP tool an agent may already call, a changed
style guide, a new dependency, a question only a person can answer. One line each, four at most.
Decisions already taken, review follow-ups and reasoning stay out of the body: a reviewer who wants
them asks, or reads the plan (`docs/plans/<file>.md`, linked in one of the lines when there is
one).

### Keeping it light

- One line per item: the name in backticks, then a clause saying what it does.
- A line that wants a second sentence is carrying a rule, a threshold or a reason. The reviewer
  finds those in the code, the tests or the plan.
- The sections above are the whole set, and one with nothing in it is left out. The one
  addition: a PR from `fix-bug` also carries its **Bug (before)** and **Fixed (after)** sections,
  after Testing, as `fix-bug` § 6 describes.

### Session marker

End every body with an HTML comment naming the worktree and Claude Code session, so the author can
find the session again from the PR:

```
<!-- claude-session: <worktree dir name> <session id> -->
```

Worktree dir name is `basename "$(git rev-parse --show-toplevel)"`. The
session id is the UUID directory in the scratchpad path from the system
prompt (`.../<worktree>/<session id>/scratchpad`); omit the comment if
there's no scratchpad path. In a cloud session there is nothing to
`--resume` locally, so the marker carries the session's claude.ai URL instead
when the environment gives one; with no URL, omit the comment. Resuming a
local one is `cd` into that worktree and `claude --resume <session id>`.

## Voice

An engineer handing a teammate a PR: direct, concrete, plain words. Say what the code does
("stops the process tree with SIGTERM"), in the words the diff uses.

Leave out:

- marketing and filler: "robust", "comprehensive", "seamless", "enhance", "leverage", "various"
- ceremony: "This PR introduces…", "Let me know if you have any questions!"
- a "Generated with Claude Code" footer or a "Co-Authored-By: Claude" trailer (the
  `no-attribution` hook blocks a body that carries either)
- praise of the implementation

## When to refuse / ask

- On main/master: stop, never PR from the default branch
- No commits ahead of base: stop, nothing to PR
- `gh` unauthenticated or `gh pr create` fails: stop and report the error
- The diff touches `docs/style-guides/**` alongside code: CLAUDE.md § Style Guides says whether
  the guide change ships in this PR. When it does, say in Review notes which guides changed. When
  it doesn't, stop and offer the split: save the guide diff
  (`git diff origin/main...HEAD -- docs/style-guides/ > <scratchpad>/guides.patch`; always
  `origin/main`, whatever the PR's base), restore the guides here
  (`git checkout origin/main -- docs/style-guides/`) and commit, then apply the patch on a
  `create-branch`-cut `docs/style-guide-<topic>` branch for its own PR. Unattended: stop and
  report; revert nothing.
- Working tree has uncommitted changes that look like they belong in the
  PR: ask whether to include them before opening (unattended: commit them
  with `commit-message`, then open)
- An open PR already exists for this branch (`gh pr view`): update it
  instead of re-creating. Fetch the live body with
  `gh pr view <number> --json body --jq .body` and `diff` it against
  `<scratchpad>/pr-<number>-body.md`, what this session last posted. If it
  differs, or there's no file (this session hasn't written one), show the
  diff and ask before running `gh pr edit --title ... --body-file ...`. Keep the
  existing `claude-session` comment; replace it only when this session's
  id differs. Unattended (`docs/agents/unattended.md`): leave a body
  that differs alone and post the fresh body as a PR comment.

## Output

Asked to draft or write: ONLY the title and body markdown, no preamble.

Asked to open or create: the PR URL.
