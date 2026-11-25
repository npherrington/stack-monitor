---
name: github-issue
description: Write and file GitHub issues in the repo's shape, marked `ready-for-agent` when an unattended agent could build them. Use when asked for an issue or ticket, or to turn a bug, plan or review finding into issues.
---

# GitHub Issue Writer

An issue is a **scoped** brief: enough for an engineer or an agent to start without asking, and nothing they would skim past. Every line either pins the change down or gets cut.

## 1. Gather the answers

Ask only what the request leaves open, all in **one** `AskUserQuestion` call:

- **Type**: Bug fix, Implementation, Update or Research spike, when the request doesn't make it plain.
- **Where it goes**: triage (the default: `needs-triage`, for the maintainer to evaluate), or accepted (a category label and no `needs-triage`). Only an accepted issue can carry `ready-for-agent` or `ready-for-human`.

Assignee is never asked: use one the user names (a GitHub login; `@me` for the user). Check that the labels exist with `gh label list --json name`: one that's missing hasn't been applied from `.github/labels.json`, so say so and point at `docs/agents/triage-labels.md` § Applying the labels rather than creating it. If `gh auth status` fails, say so and hand back the drafts as text.

## 2. Look into it

Read every file the issue will name, in this session. A bug gets traced from where it shows up to a likely cause (`code-base-scanner` when it crosses layers); a cause you haven't confirmed is written as a hunch. A path, function or cause you haven't seen goes in as "not sure where this lives yet: start by searching for X".

## 3. Write it

### Title

`type(scope): short problem statement`: lowercase, no trailing period, under ~70 chars, the problem or outcome rather than the fix (unless the fix _is_ the issue).

| Type           | Prefix                                                           | Label         |
| -------------- | ---------------------------------------------------------------- | ------------- |
| Bug fix        | `fix`                                                            | `bug`         |
| Implementation | `feat`                                                           | `enhancement` |
| Update         | `refactor` (restructure) / `chore` (deps, config, copy, tooling) | `enhancement` |
| Research spike | `spike`                                                          | none          |

Scope is the directory or module (`core`, `server`, `mcp`, `web`, `config`, `worktrees`, `stack`, `agents`, `schedules`, `feature-map`, `ci`), or narrower when clearer (`launcher`, `compose`).

### Body

```
<one to three sentences: what's wrong or wanted, and why it matters>

## Scope
- In: <what this issue changes>
- Out: <the nearby thing it leaves alone, only when it's tempting>

## Where it lives
- `path/to/file.ts:123`: its part in this change

## Approach
<the change in a few steps, with a code sketch wherever words would be vague>

## Decisions
- <open question>: <recommendation>

## Done when
- <observable check: a test, a curl, the page>

Links:
- <PR / issue / doc>
```

- **Code sketches** use real names read in step 2 and pin the **seams**, a few lines each:
  - a config key in `core/config/schema.ts`
  - a route's input or reply
  - an MCP tool's input or result
  - what crosses between `core/`, `server/`, `mcp/` and `web/`
  - an existing call site that changes

  New code inside a module is written as what it takes in and gives back. How it splits into functions is left to the plan: planners and reviewers treat any signature an issue names as the spec.

- A **Done when** line names a new test only for a rule no test reaches yet. A changed value is checked with curl against the running monitor, or on the page.
- Drop any section with nothing real in it. A spike's body is the question, what a useful answer looks like (a recommendation, a doc, a design), and what it leaves out.
- Text the user asks to include goes in **verbatim** under `## Notes`; a workflow or skill they name for the agent goes verbatim under `## Workflow`.
- Write for whoever picks it up: names belong in the assignee field.
- Another issue it depends on or relates to is `#<n>` in Links; a hard ordering also goes in `--blocked-by` or `--blocking` at create.

### `ready-for-agent`

On an accepted issue, add the label when all four hold; otherwise leave it off (an accepted issue with no state label is wanted but not agent-ready, `docs/agents/triage-labels.md`):

1. **Decisions** is empty, or every item in it has the user's answer.
2. Every path and name in the body was read in step 2.
3. **Done when** is checkable by an agent: `mise run check`, a node:test case against a fixture repo, curl against `mise run dev`, the page in a browser.
4. Nothing needs a human: design, a judgement on how the page looks, access the agent doesn't have (an Apple Developer ID, a repo setting).

## 4. Voice

Plain and direct, a message to a teammate. Name the actual thing being done; skip "robust", "leverage", "enhance", "streamline", "ensure", "comprehensive", "seamless", and any sign-off or footer.

## 5. Draft, then create

Show each draft before creating anything:

```
Title:    fix(worktrees): a branch with unpushed commits shows as merged
Labels:   needs-triage          (or bug, ready-for-agent once accepted)
Assignee: —                     (only if named)

<body>
```

For more than three issues, write the drafts to one file in the scratchpad and show a table (title, labels, one-line scope) with its path. One approval covers the batch; redraft on edits and show again.

On approval, write each body to a file in the scratchpad and create the issue with `gh issue create --title "<title>" --body-file <file> --label <a>,<b>`, plus `--assignee <login>` if named and `--blocked-by` / `--blocking` for the issues it orders against. A create that fails stops the batch: report what was created and what wasn't, so a retry makes no duplicates. Return each number and URL (`gh issue create` prints the URL).
