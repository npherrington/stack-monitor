---
name: peer-code-review
description: Review someone else's PR branch as a peer reviewer. Reconstructs intent from the PR, diffs it against main, routes the changed files through the focused review skills, and reports plain-language reviewer notes plus ranked findings ready to paste into the PR, or posts them as one review when the stack monitor's Agentic review started the session. Read-only, including git: locally the user checks the branch out; only in a cloud session does the skill run the checkout itself. Use when asked to "review this PR", "review <branch>", "peer review", or when reviewing a colleague's or a contributor's branch in a review worktree. For your own just-written code in the same session, use `skeptical-code-reviewer` instead.
---

# Review PR

Review a branch **you did not write**, from a checkout that has none of the
authoring session's context. Everything you need comes from the PR, the diff,
the guides, PLAN.md, and CI.

**This is not `skeptical-code-reviewer`.** That agent reviews the code you just
wrote, mid-session, with the plan still in context. This skill reviews a
colleague's, a contributor's or another agent's finished PR. Different inputs,
different output, different failure modes: a self-review can assume intent, a
peer review has to recover it.

**Read-only.** Surface findings; leave the branch as it is. Same contract as
`style-guide-check` and `frontend-security-coder` in review.

## Step 0: Ask the user to check out the branch

**Started by the stack monitor's Agentic review?** The session's first message
says where the worktree stands. When it says the monitor put this worktree at
the PR's head, the checkout and the fetch are done: skip the rest of this step,
name the PR by number in every `gh` command below (`gh pr view <n>`: the head
is detached, so the branch form finds nothing), and diff against the base ref
the message names. When it says the worktree is on the base because the PR is
a fork's, the same holds, and the PR's commit stays unchecked-out: read the
change with the `git diff <base>...<sha>` and `git show <sha>:<path>` forms
the message gives, wherever a step below says `HEAD`. When it says the monitor
changed nothing in the checkout, this step runs as written.

**The user drives every checkout.** Your git vocabulary here is read-only:
`status`, `branch`, `log`, `diff`, `show`.

That rules out `git checkout`, `git switch`, `git pull`, `git fetch`,
`git stash` and `gh pr checkout`, even when one looks safe. You can't see
whether they have uncommitted work, which worktree this is, or what another
session is doing in a sibling one, and the stash stack is shared across every
worktree.

A review worktree is the right home for this so nobody's in-progress work gets
disturbed, but that's the user's setup to do, not yours (`mise run worktree --
<branch>` makes one beside the primary).

**In a cloud session (`CLAUDE_CODE_REMOTE=true`)** the clone is single and
disposable (no sibling worktrees, no shared stash, no one else's uncommitted
work), so run `git fetch origin` and `gh pr checkout <number>` yourself and
skip the ask, and the baseline-fetch asks below with it: you've fetched. The
staleness count and the confirm-before-reviewing still apply.

Start by reading where you are (`git branch --show-current` and
`git status --short`), then:

- **Already on the branch to review** (not `main`, tree clean): confirm before
  starting: "you're on `feat/worktree-remove`, review that?"
- **On `main`, or the tree is dirty**: stop and ask which PR or branch they
  want reviewed, and hand them the commands to get there. In Claude Code they
  can run these inline by prefixing with `! `:

```bash
# by PR number (easiest, also sets up the remote tracking)
gh pr checkout 12

# by branch name
git fetch origin && git checkout feat/worktree-remove

# not sure which PR? list the open ones
gh pr list --limit 20

# just the ones waiting on you
gh pr list --search "review-requested:@me"
```

Wait for them to confirm the checkout is done before reviewing: reviewing
`main` against `main` produces an empty diff and a confidently wrong "no
findings".

Ask them to refresh the baseline in the same breath, since a stale
`origin/main` makes the diff show work that already landed:

```bash
# alongside the checkout
git fetch origin
```

Then check staleness yourself (read-only) and report it:

```bash
git log --oneline HEAD..origin/main | wc -l   # commits on main this branch lacks
```

If that count is large, say so in the output: a review of a branch cut weeks
ago can miss a conflict that's already landed. If `origin/main` looks
suspiciously old, ask for the fetch rather than running it.

## Step 1: Recover the intent

You weren't there. Before reading a line of code, establish what the change is
_supposed_ to do:

```bash
gh pr view --json title,body,files,labels,isDraft,closingIssuesReferences   # no number needed: reads the current branch's PR
git log --oneline origin/main..HEAD
```

Then read whatever the PR points at: a doc under `docs/plans/` or
`docs/summaries/`, every issue it closes (`gh issue view <n> --comments`), the
PLAN.md step it builds. Hold on to the problem those describe: the reviewer
notes say whether the change solves it. If the PR body is empty and the commits say "fix
stuff", that is itself the first finding: **a reviewer who can't tell what a
change is for can't tell whether it works.** Ask the author rather than
guessing at intent and reviewing the wrong thing.

No PR yet (a branch pushed for early eyes)? The commits and the diff are all
you have; say that in the reviewer notes so the author knows what you were
working from.

## Step 2: Scope the diff

```bash
git diff origin/main...HEAD --stat     # three dots: merge base, not "everything since"
git diff origin/main...HEAD
```

Use **three dots**. Two dots pulls in everything that landed on `main` since the
branch was cut and attributes it to the author.

**Review the diff, not the repo.** Flag the lines this branch touches and their
immediate blast radius (a changed function's callers, a changed shape in
`core/types.ts` and the page code that reads it). Problems that were already
there go in an FYI section, not the review: a peer review that turns into a
rewrite request doesn't get read.

Skip generated files: `schema/stack-monitor.schema.json` is written by
`mise run schema`. Check that it was regenerated (Step 4); don't review its
contents.

## Step 3: Route to the focused skills

The repo's review skills already encode the per-area rules. Run the ones that
match what the diff touches; skip the rest. The area map lives in the
`implement` skill:

| Changed                                                              | Run                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `web/**`                                                             | `style-guide-check` on the changed files, and `frontend-security-coder` |
| `core/**`, `server/**`, `mcp/**`                                     | no skill yet: Step 4's PLAN.md § Principles row is the check            |
| `tests/**`, `scripts/**`, `.github/workflows/**`, `.claude/hooks/**` | no skill: CI's `mise run check` (Step 6) covers them                    |

Fold their findings into your report: dedupe against your own, keep each once at
its highest severity, and attribute the non-obvious ones ("via
`frontend-security-coder`") so the author can trace it.

## Step 4: The cross-cutting passes

No per-area skill covers these, and they are the ones that bite in this repo.
Check each against the diff:

| Check                                                                                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/`, `server/` or `mcp/` change → does it hold to every line of PLAN.md § Principles? Re-reads instead of caching; refuses what it can't check; SIGTERM, never SIGKILL; no `--force`; 127.0.0.1 with the Host, Origin and body-size checks; MCP never starts an agent run or a schedule | Those are the house rules for that code, and there's no style guide for it yet. Cite the principle by its bold name                                                                                                                                   |
| Request, MCP or config input reaching a child process, a git argument or a path → passed as an argv element, checked the way `core/config/schema.ts` checks `Ref` and `RepoPath`?                                                                                                           | A string that starts with `-` is a git flag; a path with `..` leaves the checkout                                                                                                                                                                     |
| A repo's particulars in `core/` (a service name, a port, a path, a tool only one stack has) where the config should supply it                                                                                                                                                               | PLAN.md § What this is: nothing here assumes a particular stack                                                                                                                                                                                       |
| `core/config/schema.ts` changed → is `schema/stack-monitor.schema.json` regenerated, and does an existing `stack-monitor.json` still load (`examples/node-postgres.json` still passing its test)?                                                                                           | A test fails while the JSON Schema is out of date; a field made required or narrowed breaks every repo that committed a config                                                                                                                        |
| `core/types.ts` changed → does the page code that reads the shape still build?                                                                                                                                                                                                              | It's the one core file the page imports (`tsconfig.web.json`); a server-side rename type-checks the server and breaks the page                                                                                                                        |
| `console.log` in `core/` or `mcp/`                                                                                                                                                                                                                                                          | stdout is the MCP protocol stream (`eslint.config.js`); lint catches the call, not a library writing to stdout                                                                                                                                        |
| `docs/style-guides/**` in the diff alongside code                                                                                                                                                                                                                                           | CLAUDE.md § Style Guides says whether that ships in one PR. When it doesn't, it's Critical: a topic branch that rewrites a guide reviews itself as compliant. Re-check Step 3's citations against `git show origin/main:docs/style-guides/<guide>.md` |
| Dependency bumps: changelog read? one package per change? lockfile diff reviewed and committed?                                                                                                                                                                                             | A bump is a behavior change nobody wrote. Semver is a promise the maintainer may not have kept                                                                                                                                                        |

## Step 5: Judge the change itself

With the above mechanical checks done, read the code for the things only a
human-shaped read catches. Ranked by how often they matter here:

**Correctness**: does it do what Step 1 said it would? Error paths as well as
the happy path? Edge cases (empty, missing, already-exists, a process that
exits mid-read, a checkout whose directory is gone)? Do the tests cover the
behavior, or just execute the code?

**Structure**: does a new conditional get bolted onto an unrelated flow (a
missing abstraction), does module-specific logic land in a shared file, is
there a bespoke near-duplicate of an existing helper (`core/run.ts`,
`core/worktrees/clone.ts`)? When you flag structure, **propose the move**:
"extract this into its own helper", "reuse `X`", "make the type boundary
explicit so the branching disappears". A review that only says "this is
complex" leaves the author guessing.

**Refactors**: a refactor that relocates complexity hasn't reduced it. Count
the concepts a reader must hold before and after; if that's unchanged, say so.

**Size**: ~100 changed lines reviews well, ~300 is fine for one logical change,
~1000 should have been split. A small diff can still push a file past a healthy
boundary; when a change materially grows an already-large file, ask whether to
decompose first.

**Style**: the guides in `docs/style-guides/` are the authority, and
`style-guide-check` already cited them in Step 3. Your own taste is not the
contract: an opinion with no guide behind it is a **Nit** at most, or belongs in
the "worth documenting" section.

## Step 6: The verification story

CI is the authority. Read it rather than running suites in the review worktree:

```bash
gh pr checks     # current branch's PR
```

`.github/workflows/ci.yml` runs one job, `mise run check`: eslint, prettier,
tsc, actionlint, shellcheck, the tests and the page build.

- A red check is a finding: name the failing part of `mise run check`.
- A check that **didn't run** is also a finding (a workflow change that drops
  `mise run check`, say).
- Areas CI doesn't cover: the page in a browser (no browser tests), and
  anything macOS-only (`lsof`, `ps -ww`, launchd), since CI runs on
  `ubuntu-latest`. For those, ask the author how they verified it; don't
  assert it's broken and don't assert it's fine.

Only run something locally to confirm a specific finding you're about to file,
and say in the report what you ran. **Write "tests pass" only for a suite you
watched run.**

## Severity labels

Label every finding. This is what stops an author treating a nit as a blocker:

| Prefix       | Meaning                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Critical** | Blocks merge: security, lost work in a checkout, broken behavior, a PLAN.md § Principles break, a config change that breaks existing `stack-monitor.json` files with no say in the PR, a style guide edited where CLAUDE.md § Style Guides says not to |
| _(none)_     | Required before merge                                                                                                                                                                                                                                  |
| **Consider** | Worth doing, author's call                                                                                                                                                                                                                             |
| **Nit**      | Cosmetic, ignorable                                                                                                                                                                                                                                    |
| **FYI**      | Pre-existing or contextual, no action                                                                                                                                                                                                                  |

**Lead with what matters.** Order by leverage: correctness and the principles
first, then structural regressions, then everything else. If you have one
structural problem and ten nits, the structural problem _is_ the review. A few
high-conviction findings beat a long list.

## Reviewer notes

Before the findings, write a short **reviewer notes** section: what this change
does, in your own words, the way you'd explain it to another engineer at their
desk, ending on whether it solves the problem Step 1 found it was for. Three or
four sentences. It does two jobs: it proves you understood the
change before critiquing it, and it gives the author a chance to say "that's not
what it does", which is the most useful correction a review can get.

Walk the change, not the file list: what triggers this code, what it does, where
the interesting decision is. Name the mechanism when it's the point ("it matches
the listening process by its working directory, so a server started from a
sibling worktree on the same port doesn't read as this checkout's"). Skip the
plumbing.

Plain words. If a sentence needs a second read, rewrite it.

| Don't                                                           | Do                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| "Refactors status checks to leverage a more robust abstraction" | "Pulls the four `if (status.port)` branches into one checker per kind, so a fifth kind is one new file"                 |
| "Comprehensive enhancement of error handling"                   | "Catches `lsof` exiting 1 with no output as 'nothing listening' and lets every other failure through as a refused read" |
| "Introduces a facility for deferred processing"                 | "Starts the dependency install in the background once setup is done, so create answers straight away"                   |

Then the findings.

## Output format

Write it to paste straight into the PR:

```markdown
## Review: <PR title> (#<number>)

### Reviewer notes

<three or four plain sentences: what the change does, what triggers it, where
the interesting decision is, and anything you had to work out to follow it>

**CI:** <passing / `mise run check` failing at tsc / no CI run on the last push>

### Critical

- `<file>:<line>`: <what's wrong, the input that breaks it, and the fix you'd
  make>. e.g. "the route takes `path` from the body and hands it to
  `git worktree remove` without checking it's one of the clone's worktrees, so
  a request can name any directory git will take. Suggested: refuse a path
  `listWorktrees` doesn't return."

### Required

- ...

### Consider

- ...

### Nits

- ...

### FYI

- <pre-existing issues noticed but out of scope for this branch>

### Worth documenting

- <patterns seen here that no style guide covers; per CLAUDE.md § Style Guides, suggest the guide>
```

Omit any section that's empty. If the branch is clean, say so plainly and say
what you checked ("read the diff across 6 files, ran `style-guide-check` and
`frontend-security-coder`, CI green"), not a bare LGTM.

## Posting the review

Only when the session's first message asks for it, as the stack monitor's
Agentic review does. Otherwise the review stays in the chat for the user to
paste.

Post once, as one review:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/reviews --method POST --input - <<'JSON'
{ "commit_id": "<the commit reviewed>", "event": "COMMENT",
  "body": "## Agentic review\n\n<reviewer notes, CI, findings with no line>",
  "comments": [{ "path": "core/run.ts", "line": 42, "side": "RIGHT", "body": "**Critical**: ..." }] }
JSON
```

- **Body**: `## Agentic review`, then the output format from its reviewer notes
  down, holding every finding that has no line of its own.
- **Comments**: each finding on a line the diff shows, one comment each, with
  its severity prefix. `side` is `RIGHT` and the line's number in the new file
  for an added or unchanged line, `LEFT` and its number in the old file for a
  removed one. A finding on a line the diff doesn't show goes in the body:
  GitHub refuses the whole review over one comment off the diff.
- **Event** is always `COMMENT`. Approving and requesting changes are the
  user's.
- GitHub keeps one pending review per person per PR. When it refuses the post
  for that, say so and stop: the user's draft is theirs to submit or discard.

## Voice

Write like an engineer explaining their work to another engineer: plain,
specific, no ceremony. Same voice as `commit-message`, `pull-request`, and
`style-guide-check`:

- lowercase except proper nouns and code identifiers
- **plain verbs** for what the code does; the AI-tell words (harden, leverage,
  delve, ensure, robust, comprehensive, streamline, seamless, facilitate,
  utilize, "it's worth noting") get replaced with the actual thing being done
- short sentences. one idea each. no sentence that needs a second read
- concrete over abstract: "runs `git status` once per checkout per poll" beats
  "may have performance implications"; "any page on another origin can stop a
  service" beats "potential security concern"
- say it or leave it out, without a hedging stack ("it might possibly be worth
  considering")
- output the markdown directly, with no preamble ("Here's my review:")
- no Claude footer or co-author trailer
- comment on the code, not the author

Be direct. Softening a real bug into "this might be a minor concern" is
dishonest, and rubber-stamping helps nobody. Quantify where you can. If the
author has context you don't and pushes back, defer.

## Constraints

- **Read-only git, always:** `status`, `branch`, `log`, `diff`, `show`. The
  user drives the checkout; you hand them the command and wait. Cloud
  exception: `git fetch origin` and `gh pr checkout`, per Step 0. A worktree
  the monitor already put at the PR's head needs neither.
- **Read-only files.** No edits to the branch, no commits, no pushes. A review
  is posted to the PR only when the user explicitly asks or § Posting the
  review applies.
- **Diff-scoped.** Pre-existing problems are FYI, not review items.
- **Cite or drop it.** Style findings cite the guide and section; principle
  findings cite PLAN.md § Principles; correctness findings name the file, line,
  and the input that breaks it. A finding you can't ground is a question for
  the author, not a finding.
- **Recover intent; when you can't, ask.**
- **Approve on health, not perfection.** A change that improves the codebase and
  follows the conventions ships, even if you'd have written it differently.
