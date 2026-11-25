---
name: fix-bug
description: Fix a bug end to end — reproduce it with a failing test or against the running monitor, capture it, find the cause, fix it, then replay the same repro to prove it's gone, with the before/after output in the PR body. Use when a GitHub issue labelled `bug` is pasted, or when asked to reproduce and fix a reported bug. Not for diagnosis-only questions or a fix whose cause is already known.
---

# Fix Bug

A bug is fixed when the **repro** that went red before the fix goes green after it, and the PR shows both. Every step ends on a check; move on only when it holds.

## 1. Read the issue and branch

Fetch the issue with `gh issue view <n> --json number,title,body,labels,comments,url`, and any images in the body or comments. Write the **symptom** in one sentence: who, which surface (a route, an MCP tool, the page, a mise task, a script), what they did, what happened, what should have happened. If the issue doesn't give you the surface or the expected behaviour, ask the user before going further (unattended, per `docs/agents/unattended.md`: an issue comment naming what's missing, then stop).

Cut the branch with the `create-branch` skill, with the issue's number in the name. The PR links back to the issue through `Closes #<n>` in its body.

With no issue (a bug described in chat), write the symptom from the user's report, ask for whatever it's missing, and let `create-branch` propose a `fix/...` name.

**Done when** the symptom sentence names a surface and you're on the bug's branch.

## 2. Build the repro

The **repro** is one thing you can run that goes red on _this_ symptom and green once it's fixed. Build it before reading code for a cause: a theory without a red repro is a guess. A symptom that shows on the page gets its repro at the lowest layer that shows it, usually the route the page reads.

| Surface                                                                                 | Repro                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a function in `core/`, a route, an MCP tool                                             | a node:test case in `tests/` against a fixture repo, run on its own with `node --test tests/<file>.test.ts`. `tests/fixtures.ts` builds the repo: `tempDir`, `gitRepo`, `git`, `writeJson` for a config |
| what only shows with the real machine (`lsof`, `ps`, `docker ps`) or the running server | curl against `mise run dev` serving a repro repo (§ Running the monitor)                                                                                                                                |
| a bug that needs more checkouts of this repo                                            | `mise run worktree -- <branch>` for each, then curl as above                                                                                                                                            |

Set up the repo the symptom needs first: the config, the worktrees, the commits on each branch, the same as the issue describes. Script it, in the test or in a shell script in the scratchpad, so the replay builds the same repo again rather than relying on one you set up by hand.

If the repro won't show the symptom after trying the variations the issue allows (another config, another branch layout, the primary instead of a linked worktree), stop and report what you tried, then ask for the config, the repo layout and the exact steps (unattended: as an issue comment, then stop). Don't move on to finding a cause without a red repro.

**Done when** you've run the repro at least once and watched it show the issue's symptom (the same error, the same wrong value), not a nearby failure.

## 3. Capture the bug

Capture now, on the unfixed code: once the fix lands, the bug can't be shown again without reverting.

Save the failing test's output, or the curl command and its output, to the scratchpad as `before.txt`. Keep only the lines that show the symptom: the failing assertion with its expected and actual values, or the reply that's wrong. Open the file and check it does.

**Done when** `before.txt` is saved and shows the symptom.

## 4. Find the cause and propose the fix

Narrow down with the repro: cut steps, inputs and repo state one at a time, rerunning after each, until the smallest version still goes red. Add `console.warn` to capture real runtime values; prove each hypothesis against the repro.

Then stop and present to the user: the cause (file and line), why it produces the symptom, and the proposed fix. This is the plan-review step of the development cycle. Hand off to `feature-planner` instead only when the fix changes a design or spans more than one of `core/`, `server/`, `mcp/` and `web/`.

**Done when** the user has approved the fix (unattended: the cause and the fix are written down for the PR body, and you go on).

## 5. Fix and prove

When the repro is a curl, write the **regression test** first wherever the code has a test seam, a node:test case against a fixture repo, and watch it fail. A repro that's already a test is the regression test. Then make the fix.

Replay the repro unchanged and save its output as `after.txt`, the same lines as step 3. Run `mise run check`.

If the repro is still red after the fix, go back to step 4: capture no after output until it's green.

**Done when** the regression test passes, the unchanged repro goes green, `after.txt` shows the correct behaviour where `before.txt` showed the symptom, and `mise run check` passes. Remove any debug logging, and remove any worktree `mise run worktree` added for the repro (`git worktree remove`, then `git branch -d`).

## 6. Review and PR

Run `skeptical-code-reviewer`, and ask the user which findings to act on (unattended: `docs/agents/unattended.md` says which to apply). Open the PR with the `pull-request` skill. Its body also carries the cause and the fix in a line each, then a **Bug (before)** and a **Fixed (after)** section, each with the relevant lines of `before.txt` or `after.txt` in a fenced code block.

**Done when** the PR body shows both outputs. Unattended, finish as `docs/agents/unattended.md`'s Run finished row says.

## Running the monitor

`mise run dev` builds the page and serves it and the API on `http://127.0.0.1:7420`. Two environment variables point it:

- `STACK_MONITOR_REPO`: the checkout it serves. Point it at the repro repo; unset, it serves the checkout it runs from.
- `STACK_MONITOR_PORT`: another port, 1024 to 65535. Set one when another monitor already holds 7420: `mise run dev` refuses to start there and says which checkout holds it.

Run it in the background and wait until `curl -s http://127.0.0.1:<port>/api/health` answers. curl sends no Origin, which the server allows; a POST needs `-H 'Content-Type: application/json'` and a JSON body. When done, stop the server you started and nothing else.
