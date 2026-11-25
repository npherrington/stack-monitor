# Development Cycle

**Pick the weight first**, then run the cycle below at that weight. Name it in one line before
starting ("Standard: one route and its test"). The user can move it, and their word holds for the
rest of the session.

| Weight       | When                                                                                                                                                                                                     | What runs                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Light**    | the user says "no workflow steps", "just do it", "don't plan" or "quick"; a fix asked for on an open PR                                                                                                  | branch (step 0) unless already on the change's branch, make the change, run the quality gate (§ When to Run Tests), look at a visible change running, report. Opening a PR is still step 7 |
| **Standard** | one area, nothing on the Full list                                                                                                                                                                       | every step, with the plan written in chat (the files, the change in each, open questions) and one review round                                                                             |
| **Full**     | a change to `stack-monitor.json`'s schema, a new route or MCP tool, anything that runs a command, signals a process or deletes a directory, a new module, or work spanning `core/`, `server/` and `web/` | every step as written                                                                                                                                                                      |

Moving up is cheap: when a Light or Standard change turns out to touch something on the Full list,
say so and switch. At Standard and Full, plan before writing any code.

0. **Branch** - Before writing any code, cut a fresh branch from a freshly fetched `origin/main`
   with the `create-branch` skill, so the work isn't built on a stale `main` or mixed into another
   branch. If changes are already on the wrong branch, `create-branch` carries them over. Then
   `mise run sync`.
1. **Plan** - At Full, the `feature-planner` agent writes the plan into `docs/plans/`; at Standard,
   write it in chat. A change to docs, skills or steering files alone plans in chat. Brief the
   planner with every style guide the `implement` skill lists for the areas the plan touches, and
   with PLAN.md § Principles for anything in `core/`, `server/` or `mcp/`.
2. **Review Plan** - Present the plan for feedback; edit if asked. Put each structural choice (a
   new dependency, a new module, something the monitor would start remembering) to the user as a
   question, with the lightest option that would work beside it. For a Full plan that changes
   existing behaviour, offer to run `plan-iterator` against the code first (unattended:
   `docs/agents/unattended.md`).
3. **Implement** - Once approved, follow the plan. **Read the guides first**: before the first
   edit in an area, read every guide the `implement` skill lists for it, each in full. Invoking the
   skill or seeing the hook's reminder is not reading them. **Explain as you go**: before each edit
   or small group of related edits, say in a sentence or two what the code does and why, the way
   one engineer talks to another looking over their shoulder. Skip trivial mechanical edits. Plain
   words, no "harden", "leverage", "delve", "ensure", "robust" or "streamline": name the actual
   thing being done.
4. **Code Review** - Spawn the `skeptical-code-reviewer` agent once, after the quality gate passes.
   It is the whole review: it runs `style-guide-check` and the area's review skill from `implement`
   itself. Brief it with the diff, the user's request and the gate's result, not the plan's
   reasoning: a reviewer told a design is deliberate stops questioning it.
5. **Address Feedback** - Ask the user which review items to act on, recommending the Critical
   ones (unattended: `docs/agents/unattended.md`).
6. **Iterate** - Make the chosen fixes, then one re-review at most: `skeptical-code-reviewer` at
   `medium` effort, briefed with the fix diff and the findings it answers. What it reports below
   Critical goes in one comment on the PR as follow-ups, not in its body. A further round runs only
   when the user asks.
7. **Open the PR** - Any request to open, create or push a PR goes through the `pull-request`
   skill, never a bare `gh pr create`. It writes the title and body and opens it as a draft. Small
   fixes found during the work or in review go in this PR; unrelated or risky work gets its own.

Commits and PRs carry no Claude attribution: no `Co-Authored-By: Claude` trailer, no "Generated
with Claude Code" footer. A hook (`.claude/hooks/no-attribution.sh`) blocks a commit or PR that
has one.

## Starting from an issue

A message that is only a GitHub issue URL (or `#123`), or one that says to start on an issue ("let's start on this issue", "start work on #123"), means "start looking into this issue":

1. Fetch it with `gh issue view <n> --json number,title,body,state,labels,assignees,comments,url`, plus any images in the body or comments.
2. Assign it to the current user with `gh issue edit <n> --add-assignee @me`. On GitHub the assignee is what marks an issue In Progress (`docs/agents/triage-labels.md` § Status). Do this only for those two triggers: an issue link inside a longer question or request doesn't count. If the issue is closed, or an open PR already closes it, leave it alone. If it's assigned to someone else, don't add yourself.
3. If it has the `bug` label, run the `fix-bug` skill from here. Otherwise, investigate the relevant code.
4. Report back briefly: what the issue asks, what you found, and the proposed next step (unattended: as the first issue comment, see `docs/agents/unattended.md`). Then continue with the cycle above: cut the branch with `create-branch`, which names it after the issue's number, then plan. The PR's `Closes #<n>` links it back.

If `gh auth status` fails, say so and ask for the issue's contents instead of guessing from the URL.

---

# Style Guides

`docs/style-guides/` holds how to write code here; its `README.md` indexes what each guide covers.
Before planning, coding or reviewing, read the guides the `implement` skill maps to your area (the
edit-time hook points you to its section). There are guides for the page (`web/`) only so far; for
`core/`, `server/` and `mcp/`, PLAN.md § Principles and the neighbouring code are the rule.

**Suggesting a guide**: when the code shows conflicting patterns no guide covers, flag it and
suggest a guide that settles it.

**Changing a guide**: while the tool is early, a guide change a feature needs goes in that
feature's PR, said in the PR body. Otherwise a guide change is its own PR on a
`docs/style-guide-<topic>` branch, after asking the user, with a body that says why the rule
changes. "Codify why we chose X" is a decision record in `docs/decisions/`, not a guide edit.

**Writing a guide**: the rule, not how we arrived at it, with examples drawn from code on `main`.
`docs/style-guides/README.md` § Writing a guide has the full shape; read it first.

---

# Decisions

`docs/decisions/` records **why the architecture is the shape it is**: the dependencies the tool
rests on (Vite and React, shadcn on Base UI, TanStack Query, the router, forms, the tracker) and
the structural choices that would otherwise get re-argued. `docs/decisions/README.md` indexes them.

**Read one before** taking on a new dependency, replacing one, or arguing that a current choice is
wrong. `Alternatives rejected` usually already answers it, and `Context` says whether the reason
still holds.

**Write one when** we adopt or drop a dependency that would take real work to swap, reverse an
earlier choice, or knowingly defer a structural fix. The format is
`.agents/skills/domain-modeling/ADR-FORMAT.md`. A record is amended only to change its `Status`;
reasoning that turns out wrong gets a new record superseding the old one.

**Not for**: rules about code you're about to write (`docs/style-guides/`), or the tool's
principles and module plan (PLAN.md).

---

# When to Run Tests

Run what covers your change before committing. `mise run check` is everything CI runs; a local
pass is a CI pass. Use mise tasks, never `npx prettier` or a global eslint, which can resolve a
different version than the pinned one.

| Changed files                                               | Run                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `core/**`, `server/**`, `mcp/**`, `tests/**`                | `mise run test && mise run lint`                                                    |
| `core/config/schema.ts`                                     | also `mise run schema`, and commit the rewritten `schema/stack-monitor.schema.json` |
| `web/**`, `index.html`, `vite.config.ts`, `components.json` | `mise run lint && mise run build`, then look at it running (`mise run dev`)         |
| `scripts/*.sh`, `.claude/hooks/*`                           | `mise run lint:scripts` (`bash -n` misses quoting bugs)                             |
| `.github/workflows/*`                                       | `mise run lint:workflows` (shellcheck covers each `run:` block)                     |
| anything before a PR                                        | `mise run check`                                                                    |

Tests run against fixture repos made in a temp directory (`tests/fixtures.ts`), with real `git`
and no mocks of it.

---

# Unattended sessions

`STACK_MONITOR_UNATTENDED=1` means no one is in the chat (a subagent checks
`$STACK_MONITOR_UNATTENDED`). Read `docs/agents/unattended.md` before the first action: it gives
the recommended answer for every decision gate and says how to record it. A destructive or
irreversible action (force push, deleting a file the user may want, staging a secret, overwriting a
hand-edited PR body) stays a stop even unattended.

---

# Agent skills

## Issue tracker

Issues are tracked in GitHub Issues through the `gh` CLI. See `docs/agents/issue-tracker.md`.

## Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, with `bug` / `enhancement` as categories. See `docs/agents/triage-labels.md`.

## Domain docs

Single-context: root `CONTEXT.md`, with decision records in `docs/decisions/`. See `docs/agents/domain.md`.
