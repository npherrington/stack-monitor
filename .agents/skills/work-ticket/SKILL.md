---
name: work-ticket
description: Work a GitHub issue end to end, unattended, through to a PR ready for review, or a draft awaiting a decision. Use when asked to take a named issue to a PR without stopping ("work #123 end to end"), to "grab a ready-for-agent issue", or when the session's first message names a board ticket (`BEANS-3`). A bare issue URL or "start on this issue" stays with CLAUDE.md's attended flow.
---

# Issue to PR

One issue, from pick-up to PR, **unattended**. Every decision gate in the skills below takes the answer `docs/agents/unattended.md` gives, recorded where that file says, whether or not `STACK_MONITOR_UNATTENDED` is set. A destructive action is still a stop. This skill only sequences: each step's skill or section owns its rules.

**A board ticket** (an id shaped `PREFIX-N`) takes `docs/agents/issue-tracker.md` § Board tickets in place of every issue read, comment and status below, and skips step 1.

## Orchestrate

You are the orchestrator. Run each phase of steps 4 and 5 as a subagent, `general-purpose` or the agent its step names, on the model and at the effort in the table below. Pass both on every spawn (the Agent tool's `model` and `effort`): an agent left without a `model` runs on yours. Spawn every subagent yourself, and keep only its **handoff**. Test output, server logs and file reads stay in the subagent, so your context holds the run's decisions and nothing else.

| Phase                                                                              | Model    | Effort   | Why                                                                                       |
| ---------------------------------------------------------------------------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| Plan: a bug's repro-to-cause, or a feature's plan and its stress test              | `opus`   | `xhigh`  | the cause or design decides everything after it                                           |
| Implement                                                                          | `sonnet` | `high`   | carries out a settled plan; a defect it leaves costs a fix round, a drive and a re-review |
| Fix round: an implement phase for a drive's defect or the review's Criticals       | `sonnet` | `medium` | each fix is pinned to a named finding                                                     |
| Drive: replays, before/after output, checking a change against the running monitor | `sonnet` | `high`   | judges what the monitor serves; designs nothing                                           |
| Review                                                                             | `opus`   | `xhigh`  | the last check before a human                                                             |
| Re-review                                                                          | `opus`   | `medium` | checks each fix against the finding it answers                                            |
| Ship                                                                               | `sonnet` | `medium` | writes the commits and the PR from the handoff                                            |

Every brief carries the issue number and URL, the branch, the absolute worktree path with a line telling the subagent to start each command with `cd <worktree> &&` (its shell starts elsewhere), the monitor's URL with its port written in and the repo it serves (step 3), and the handoff path. It ends with: _"Unattended run: follow docs/agents/unattended.md. Decide, record, ask nothing, and do the work yourself rather than delegating it."_ A subagent sees neither your context nor the environment variable. An implement brief also asks for `comment-trimmer`'s result for the diff in the handoff: its counts (deleted, trimmed, kept), or `nothing to trim`.

The **handoff** is `<scratchpad>/work-ticket/<n>.md`. Each phase appends a section: what it did, the files it touched, output paths, decisions taken, and what is still open. Its report points there. The PR body's review notes and the closing issue comment are built from it. A phase that returns without appending is rerun once; a second miss is a stop. An implement section without that `comment-trimmer` result counts as not appended.

A stop at any step is the unattended stop (an issue comment saying where and why), followed by step 6.

## When the user is in the chat

The run is unattended, but the user may be watching and steering. When they send a change of scope or a tweak mid-run:

- The change is Light weight (`CLAUDE.md` § Development Cycle). Let the running phase finish, or stop it when the change replaces its work, then make the change yourself in the main session so they see the diff. Run `mise run check`, append the change to the handoff as a phase would, and tell them what changed.
- A gate they answer takes their answer, not the unattended table's.
- When they want the monitor's port, stop the server the run started and tell them the port is free.

The review and ship phases still ahead cover their changes too.

## 1. Pick

Skip this step when the request names an issue. Otherwise list open issues labelled `ready-for-agent` with no linked PR, unassigned or assigned to the user: `gh issue list --label ready-for-agent --search "-linked:pr no:assignee sort:created-asc" --json number,title,labels,createdAt`, and the same with `--assignee @me` in place of `no:assignee`. Take the issue the request's hint names ("start with the compose bug"). With no hint, take a `bug` first, then the oldest.

**Done when** one issue is chosen. If there are none, say so and stop.

## 2. Start

`CLAUDE.md` § Starting from an issue, steps 1 and 2, including its unattended `ready-for-agent` check.

**Done when** the issue is assigned to the user, or that section left it alone and the run has stopped. A board ticket: it is read and in "In progress".

## 3. Branch and monitor

Run `create-branch` with the issue's number, or the ticket's key, in the name. When the first message says the monitor made this worktree and its branch, keep that branch instead of cutting one: `git fetch origin`, then `git merge --ff-only origin/main` while the branch has no commits of its own. Then `mise run sync`, unless the first message says the repo's install is already running in the worktree: wait for that one (its log is named there). When the issue needs the running monitor, start `mise run dev` in the background with `STACK_MONITOR_PORT` set to a free port (the default 7420 is likely the user's own monitor) and `STACK_MONITOR_REPO` pointed at the repo the issue's behaviour needs: a throwaway repo built by a script in the scratchpad, or, unset, the worktree itself. List what you started in the handoff for step 6, including any worktree `mise run worktree` added. `fix-bug` § Running the monitor has the details.

**Done when** the branch is cut from a freshly fetched `origin/main`, its dependencies are installed, and, when the issue needs it, `curl -s http://127.0.0.1:<port>/api/health` answers from this worktree's server.

## 4. Plan, build, prove

**A `bug`** goes through `fix-bug` § 2 to § 5, in three phases:

- **Plan** runs § 2 to § 4: a red repro, `before.txt`, and the cause and fix written to the handoff. It removes its debug logging and leaves all other code untouched.
- **Implement** writes the fix, plus a regression test where the code has a seam, and runs `mise run check`.
- **Drive** runs § 5's replay: the unchanged repro and `after.txt`. If it is still red, a new plan phase gets the replay's result. Two red rounds is a stop.

**Any other issue** goes through `CLAUDE.md` § Development Cycle's plan, review and implement steps, at the weight the issue calls for (that section's table). Light is the user's call, so a run picks Standard or Full and the handoff records which and why.

- **Plan** at Full runs `feature-planner`, then `plan-iterator` against the code and the issue, acted on as the unattended table's plan-review row says. At Standard the plan phase writes the plan into the handoff itself: the files, the change in each, and open questions with the recommended answer.
- **Implement** builds the plan and runs `mise run check`.
- **Drive**, for a change the API or the page shows, checks it against the running monitor: curl for what a route returns, the page in a browser for what only the page shows. It saves each curl and its output to the scratchpad, and writes what it looked at on the page into the handoff. A defect goes to a fix round, then drive again. Two rounds that still show the defect is a stop.

**Done when** `mise run check` passes and the drive phase reports the issue's behaviour on the running monitor (for a bug, the repro is green), with every output file saved and its path in the handoff.

## 5. Review and ship

- The **review** is `skeptical-code-reviewer`, briefed with the issue, the diff and the result of `mise run check`.
- Sort the findings as the unattended table's review row says. The Critical ones go through one fix round, and a fix that changes behaviour gets a drive replay of only what the fix changed. No Critical findings means no fix round.
- After the fix round, one **re-review**: `skeptical-code-reviewer` again, briefed with the fix diff, the issue and the findings the fixes answer. A Critical it still reports takes the unattended table's Open finding row, and everything else goes in the closing comment. The run ships after it, with no second fix round.
- A **ship** phase runs `ship-it`. For a bug, this step replaces `fix-bug` § 6, and the body carries § 6's before and after sections from the files already saved. The ship brief's whole spec for the PR body is `pull-request`'s § Body and `docs/agents/unattended.md` § PR body and closing comment.

**Done when** the run is at the end state `docs/agents/unattended.md` gives (its Run finished row, or its Open finding row), with the closing issue comment posted from the handoff. A board ticket takes that comment and is in "In review".

## 6. Tear down

Stop what the run started and nothing else: its servers and any worktree it added (`git worktree remove`, then `git branch -d`). Then report the PR URL and whether it is ready or a draft, the issue's state, the decisions taken, the findings skipped, and anything outstanding (a check that needs a human, another machine).

**Done when** everything on the handoff's started list is stopped or removed.
