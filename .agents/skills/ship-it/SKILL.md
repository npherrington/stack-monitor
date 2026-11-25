---
name: ship-it
description: Commit, push and open a draft PR for the current branch in one go, by chaining commit-message and pull-request. Use when the user runs /ship-it or their whole message is "ship it".
---

# Ship It

Run each skill below in order and let it own its rules; this skill only
sequences them. Move to the next step only when the current one succeeds.

## 1. Commit

If the working tree has changes, run the `commit-message` skill. A clean tree
skips straight to step 2.

**Done when** `git status` shows only the files `commit-message` chose to skip.

## 2. Push and open the PR

Run the `pull-request` skill as an "open the PR" request: it pushes, then opens
a draft PR.

If the branch already has a PR (`gh pr view --json title,body,url`), push, then
check whether its title and description still hold up against the whole branch
(`git log` and `git diff` from the `origin/<base>` merge-base), not just the
latest commits. They hold up when every change a reviewer should know about is
there and nothing described has since been reverted or reworked. If they do,
leave them. If not, rewrite whichever is out of date in `pull-request`'s format
and apply it through `pull-request`'s existing-PR path, which checks for hand
edits first.

**Done when** you have the PR URL, and an existing PR's title and description
either held up or were updated.

## Stop conditions

Any stop in a chained skill (on `main`, a failed commit hook, a rejected push,
`gh` not signed in, an existing PR edited by hand) stops the whole run. Report
where it stopped and what already happened (commits made, whether it pushed),
and wait for the user. Unattended (`docs/agents/unattended.md`): that report
is the stop that file describes, an issue comment (a PR comment when there's no
issue), and the turn ends. A run that reaches the end unattended finishes as
that file's Run finished row says.

## Output

The commits made (`<short hash> <subject>`), the PR URL, and whether an
existing PR's title or description was updated (and why) or left as it held up.
