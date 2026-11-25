---
name: create-branch
description: Start a fresh branch off an up-to-date main. Fetches `origin/main` and cuts a new branch from it, with no local `main` needed. Use when asked to "create a branch", "start a new branch", "branch off main", or "make a branch for this". Takes a branch name if given (or names one after the GitHub issue in play), otherwise proposes one from the conversation and confirms with the user. Stops and reports if the fetch fails or the branch already exists.
---

# Create Branch

Cut a new branch from a freshly fetched `origin/main`. The branch name is
decided one of three ways: the issue in play names it, the user hands you one,
or you propose one from the conversation and confirm before cutting.

## Workflow

### 1. Decide the branch name

The shape is `<type>/<kebab-case-description>`, where `<type>` is one of
`feat`, `fix`, `chore`, `refactor`, `docs`, `test`: bug → `fix`, new
capability → `feat`, tooling or dependencies → `chore`, internal cleanup →
`refactor`. The description is 2–5 words, lowercase, hyphen-separated:
`feat/worktree-remove`, `fix/port-check-ipv6`, `chore/pin-actionlint`. If
recent branches (`git branch -a --sort=-committerdate`) have settled on
another style, match that.

- **GitHub issue in play** → put its number first in the description:
  `<type>/<number>-<short-description>`, e.g. `fix/12-port-check-ipv6`, with
  the type from the issue (a `bug` label → `fix`). Cut without confirming.
  Skip to step 2.
- **Name given** → use it verbatim (only normalize obvious typos like spaces →
  hyphens; otherwise leave it exactly as the user wrote it). Skip to step 2.
- **No name given** → use `AskUserQuestion` to offer 2–3 concrete suggestions
  in the shape above, plus let them write their own. Don't cut the branch
  until the name is settled. In an unattended session
  (`docs/agents/unattended.md`) there is no one to ask: use the first name you
  would have proposed.

### 2. Fetch the base

```bash
git fetch origin
```

If the fetch fails (auth, network, no `origin` remote): **stop**, show the
error, and tell the user. Nothing is merged here, so there is no conflict to
resolve; a local `main`, checked out elsewhere or missing entirely, doesn't
matter.

### 3. Cut the branch

```bash
git switch -c <branch_name> --no-track origin/main
```

Uncommitted changes come along: that's how work started on the wrong branch
is carried over (CLAUDE.md § Development Cycle step 0). Confirm to the user
which branch they're now on and that it's based on `origin/main` as of the
fetch, not on any local `main`. Local `main` is never updated here; use
`origin/main` as the base everywhere.

## When to refuse / ask

- **Not a git repo / no `origin/main`**: stop and say so.
- **A separate checkout wanted** ("in a new worktree", "beside this one"):
  that's `mise run worktree -- <branch>`, which cuts a new branch from a
  freshly fetched `origin/main` into a linked worktree and installs its
  dependencies. Name the branch as above and run that instead.
- **Branch already exists**: `git switch -c` will fail. Report it and ask
  whether to switch to the existing branch (`git switch <name>`) or pick a
  different name; leave the existing one as it is. Unattended: switch to it
  when its name carries the issue's number; otherwise stop with a comment on
  the issue (`docs/agents/unattended.md`).
- **Uncommitted work in the tree**: `switch -c` carries it. Only ask when the
  changes clearly aren't this branch's work, or when `switch` refuses because a
  tracked file differs between `HEAD` and `origin/main`; then surface it and
  ask how to handle it (commit first, or abort) rather than deciding for them.
- **Leaving a branch with work in flight** (an open PR the user is still
  testing, untracked files): say which branch you're leaving and what it
  carries, and switch back to it when the side task is done, so the user's
  checkout matches what they're working with.
- **Ambiguous name with no conversation context**: if there's nothing to base a
  name on and none was given, ask the user what the branch is for.

## Voice

Keep it terse and practical. Report what git did, name the branch, and stop.
No narration of each step, no marketing language.
