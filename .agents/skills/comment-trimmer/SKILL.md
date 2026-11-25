---
name: comment-trimmer
description: Trim verbose and explanatory comments out of the code you just wrote. Scans the current diff (working tree, or vs the merge-base with `origin/main`), judges each added or changed comment against this repo's comment style, and edits the bloated ones down: deleting comments that restate the code or narrate a change, collapsing the over-long, keeping the non-obvious "why" and the one-line note that says what a function or field holds. Edits files, but only comments on lines the diff touched. Use after an implementation step, when asked to "trim comments", "clean up the comments", "de-clutter the comments", or as the comment pass of the implement cycle.
---

# Trim Comments

Run after writing code. The job: take the diff you just produced and strip the
comment clutter out of it, so what's left is lean. Names and types carry the
meaning, and a comment survives only if it says something the code can't.

The house rule: **a comment says what the code can't.** Here that is two kinds
of comment, both short: a _why_ (the constraint, quirk or attack the code
answers), and a one-line _note_ on a function, type or field saying what it
holds or gives back, in words its name leaves out. Everything else goes. This
skill enforces that on fresh code, where it's cheap to fix.

## Scope: the diff, and only the diff

This skill edits **only comments on lines the current change added or
modified.** Elsewhere the rule is _preserve existing comments_, so untouched
code keeps its comments, even ones this rubric would cut. The diff is the
boundary.

- Default target: the working tree: `git diff`, `git diff --staged`, and
  untracked files from `git ls-files --others --exclude-standard` (every line
  of an untracked file counts as added).
- If the user says "the branch" or "vs main": `git fetch origin main`, then
  `git diff "$(git merge-base origin/main HEAD)"` plus untracked files. Local
  `main` isn't kept current, so always diff against `origin/main`.
- A comment is in scope only if the comment line itself is added or modified.
  A pre-existing comment, even directly above a changed line, is **out of
  scope**: if your change made it wrong, flag it and leave the text alone.

It changes **comments only**: code lines stay byte for byte. If trimming a
comment would require touching the statement it annotates, stop and flag it.

## The decision: DELETE / TRIM / KEEP

For every in-scope comment, pick one.

### DELETE: the comment adds nothing the code doesn't already say

Cut it entirely. Signals:

- **Restates the code.** `// increment counter` over `count++`.
  `// read the config` over `loadConfig(...)`. `# fetch origin` over
  `git fetch origin`.
- **Labels the obvious.** `// check the port is free` over an
  `if (await portIsFree(port))` whose name already says it. These narrator
  labels read as clutter: the function name is the label.
- **Narrates intent the name carries.** `// make sure path is inside the
checkout` over a check that plainly does that. If renaming a variable or
  helper would kill the comment, prefer that.
- **Justifies a refactor / explains a change** ("simplified this", "moved
  logic here", "now uses X"). The diff and git history are the record; the
  comment rots.
- **Records who decided, or where.** A comment whose content is the sign-off:
  who accepted a tradeoff, "fine for now", a bare issue number. The PR body or
  `docs/decisions/` holds it; in code it is stale the day the decision changes.
  A security tradeoff is no exception: KEEP is for why the code does what it
  does. A comment that also carries a why is a TRIM: keep the why, cut the
  sign-off. A TODO keeps its issue number.
- **A note that only echoes the signature.** `// Lists the worktrees.` over
  `listWorktrees()`.

### TRIM: the comment has a real reason to exist but is bloated

Keep the signal, cut the fat. Signals:

- A multi-line block where one line carries the point and the rest restate
  the code: collapse to the one-sentence note plus the non-obvious detail.
- A JSDoc block (`/** ... */` with `@param`/`@returns`) on code that takes a
  `//` line here: none of `core/`, `server/`, `tests/` or `web/` uses JSDoc.
  Keep only the parameters that aren't obvious, in the `//` line
  (`// repo: the checkout the monitor serves the clone through.`).
- Prose padding: "It's worth noting that…", "This function basically…",
  "In order to…". Reduce to the bare statement.

### KEEP: the comment explains what the code can't

Leave it (untouched, or as-is after trimming). Calibrate against real examples
from this codebase:

- An attack the code stops: _"The Host check stops DNS rebinding."_
  (`server/http.ts`); _"A framed copy would take a click on Stop with the
  Origin check none the wiser."_
- A platform or tool quirk: _"macOS's tmpdir is under /var, which is
  /private/var, and the code under test compares canonical paths."_
  (`tests/fixtures.ts`); _"An after() called from inside a before() hook runs
  as that hook ends, with the tests still to come."_
- A rule the type can't show: _"Handed to git as an argument, so it can't
  start with '-'."_ (`core/config/schema.ts`); _"stdout is the MCP protocol
  stream, so core and mcp write to stderr only"_ (`eslint.config.js`).
- The cost of the other choice: _"Per-commit off PRs: a shared group would
  cancel the run of one push to main with the next."_ (`ci.yml`); _"No
  credential prompt: a fetch that needs one fails"_ (`scripts/worktree.sh`).
- The note on a function, type or field: _"The primary checkout: the one that
  isn't linked, which git lists first."_ (`core/worktrees/clone.ts`);
  `port: number // 0 for one the system picks` (`server/http.ts`); a file's
  first line saying what it holds.
- A `TODO`/`FIXME` with a concrete reason and fix. Keep it, and flag it if
  it looks stale.

The test for KEEP: **could a competent reader of this codebase derive this
from the code in a few seconds?** If yes → DELETE/TRIM. If it'd cost them a
detour into another file, a git blame, a man page or an external doc → KEEP.

## Comment norms by area (what "right-sized" looks like here)

Drawn from how the codebase writes them.

- **`core/`, `server/`, `mcp/`, `scripts/*.ts`**: `//` lines only. An exported
  function or type gets a one- or two-line note when its name leaves out what
  it holds, returns or refuses; a function whose name says all of it gets
  none. Interface fields take a trailing `//` for a unit, a source or a special
  value. A file opens with a line saying what it holds when its name doesn't.
- **`tests/`**: a test's name is its doc. A comment explains a fixture's quirk
  or why a test is shaped oddly (the `after()` placement above).
- **`web/`**: a component's props type is its doc; a comment explains a
  browser workaround, an effect's timing, or why a query is shaped the way it
  is (`web/lib/api.ts`'s "anything else means the monitor isn't there").
- **Shell, `mise.toml`, workflows**: `#` above a setting or step whose reason
  isn't in its name: the cost of the other choice, the tool's quirk.

## Workflow

1. **Get the diff** per the Scope section: tracked changes plus untracked
   files. Identify the files and the added/changed line ranges.
2. **Read each changed file** around those ranges so you judge comments in
   context: you can't classify a comment without seeing what it annotates.
3. **Classify** every in-scope comment as DELETE / TRIM / KEEP using the
   rubric above. Out-of-scope comments: skip silently.
4. **Show the plan before editing.** List each DELETE and TRIM with file:line,
   the comment text, and the verdict + one-line reason. Group by file. This is
   the moment for the user to veto: comments can carry intent the author
   wanted preserved.
5. **Apply** the DELETE/TRIM edits (comments only). Leave KEEP untouched.
6. **Report** what changed: counts (N deleted, M trimmed, K kept) and the file
   list. If anything was ambiguous, say which and why you left it.

For a big diff, do step 4 as the deliverable and let the user say "go" before
step 5, rather than rewriting dozens of comments in one pass.

## When to flag instead of edit

- An empty diff, or no in-scope comments: report "nothing to trim" and stop.
- A comment whose removal would only be safe if the code were renamed: flag
  "this label is redundant; better fixed by renaming `x` to `y`."
- A comment you're not sure is redundant vs load-bearing: **keep it and flag
  it.** False-keep is cheap; false-delete loses information.
- A TODO/FIXME: keep it; flag it if stale.

## Constraints

- **Diff-scoped.** Only comments on lines this change added or modified; the
  rest of the file's comments are out of bounds.
- **Comments only.** Code, logic and the formatting of code lines stay as
  they are.
- **Bias to KEEP on doubt.** When you can't tell if a comment is load-bearing,
  keep it and say so. Deleting real information is worse than leaving a
  borderline one.
- **Preserve TODO/FIXME.** Flag, don't delete.
- **Show before you cut** on anything beyond a couple of trivial deletes.

## Voice

Engineer-to-engineer, same as the other skills here. Lowercase except proper
nouns and code identifiers. Plain verbs, none of the AI-tell vocabulary
("harden", "leverage", "ensure", "streamline"). When you state a verdict, name
the actual reason: "restates the `count++`", not "this comment is suboptimal".
