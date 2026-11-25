---
name: plan-iterator
description: Pressure-test a feature-planner plan before implementation by checking it against two things — the actual codebase (do the cited files/functions/signatures exist and match, what touch points did it miss) and the user's expected flow (does the plan do what they actually want). Surfaces the gaps, then refines the plan in place. Use after a plan exists but before coding, when asked to "stress-test the plan", "iterate on the plan", "check the plan against the code", "does this plan match what I want", or to validate a plan's assumptions.
---

# Plan Stress Test

You're handed two things: a `feature-planner` **plan** and the user's
**expectation** of how the feature should work. The job is to close the gap
between them — but not by reading the plan at face value. The plan's own
prose ("we'll change these files") is a claim, not the truth. The truth is
what _implementing the plan would actually do to the codebase_.

So the skill works in three moves:

1. **Derive the real footprint.** Independently work out how the plan would
   be implemented — every file, function, behavior, and adjacent thing
   (callers, tests, generated client, other layers) it would actually touch
   if someone built it. This usually exceeds what the plan says it touches;
   the difference is where bugs live.
2. **Classify each touch: add or change.** For every point in that footprint,
   is the plan **adding** something new, or **changing** existing behavior?
   "Change" is the higher-risk class — it has a before-state and existing
   callers that can break.
3. **Check it against the mental model.** Hold each add/change up against the
   user's expected flow. Does the user expect this to be added / changed? Is
   the add/change _correct_ — right place, right behavior, right scope? Or is
   it scope creep (an add nobody asked for), a scope gap (an expected change
   that's missing), or a misread (changes the wrong thing)?

Then **iterate the plan** — update the plan file in place once the user
confirms direction. It's a loop, not a one-shot: derive, classify, check,
surface deltas, get direction, refine, repeat until the footprint and the
mental model agree.

## When to use vs other skills

| Goal                                                  | Use                     |
| ----------------------------------------------------- | ----------------------- |
| Pressure-test a plan vs code + intent, then refine it | this skill              |
| Write the plan in the first place                     | `feature-planner` agent |
| Trace how one symbol/flow moves through the repo      | `code-base-scanner`     |
| Find bugs/nits in written code (a diff)               | `code-review`           |
| Check written code against a layer's rules            | `style-guide-check`     |

Reach for this **after** a plan exists and **before** implementation. If
there's no plan yet, send the user to `feature-planner` first. If the code is
already written, the plan stage is over — use `code-review` or the `skeptical-code-reviewer` agent.

## Input

- **A plan file** — usually under `docs/plans/`, produced by `feature-planner`. If
  the user doesn't name one, look in `docs/plans/` and confirm which (the plan
  named for the current branch, else the one last committed to on it — say
  which you picked).
- **The user's expected flow** — what they think should happen, step by step.
  They may state it up front; if they don't, you'll reconstruct what the plan
  _implies_ and ask them to confirm or correct it (see step 4). Don't assume
  the plan's flow is the intended flow — that assumption is the whole thing
  this skill exists to check.

## The footprint, classified, checked

The unit of work is a **touch point**: one concrete thing implementing the
plan would do to the codebase. For each, you carry three facts:

1. **What** — the file/function/behavior, cited `file:line`.
2. **Add or change** — is the plan introducing something new (`add`), or
   modifying behavior that already exists (`change`)? A `change` is the
   dangerous kind: it has a before-state, existing callers, and tests that
   encode the old behavior. Flag every `change` to existing behavior loudly —
   that's where a plan silently breaks something.
3. **Verdict vs the mental model** — does the user expect this add/change, and
   is it correct?
   - `ok` — expected and right
   - `creep` — an add/change nobody asked for (e.g. a new tracking event the
     user didn't request; gold-plating)
   - `gap` — something the user expects that the footprint doesn't deliver
   - `misread` — touches the wrong thing, or changes behavior the user wanted
     left alone
   - `wrong-key` — the identity / source-of-truth / matching assumption
     differs from the user's (a frequent one — plan keys on email, user means
     phone)
   - `heavy` — the right thing, built heavier than the job: a new collection
     where a Redis key with a TTL would do, an ABC with one implementation, a
     workflow around one repository call. Name the lighter mechanism

Two kinds of error feed these verdicts, and they have different fixes — keep
them distinct:

- **Footprint ↔ code errors** — the plan's picture of the code is wrong:
  stale `file:line`, a signature that doesn't match, "X already exists" when
  it doesn't, or a touch point the plan never accounted for (a caller, a
  test, the generated client, a second write path). These you find by
  _reading the code_, not the plan.
- **Footprint ↔ intent errors** — the plan's picture of the code is fine, but
  what it builds isn't what the user wants: the `creep` / `gap` / `misread` /
  `wrong-key` / `heavy` verdicts above. These you find by _diffing against the mental
  model_.

A plan can be flawless on the first and still build the wrong thing on the
second. Check both.

## Workflow

### 1. Read both inputs

Read the plan fully. Pull into scratch notes: every `file:line` / function /
signature / "already exists" assertion, the flow it describes (ordered path,
branches, triggers), and its stated scope. Separately, capture the user's
**expected flow** — what they said should happen. If they didn't spell it
out, note that you'll have to reconstruct-and-confirm it in step 4.

### 2. Derive the real footprint (fan out)

Don't take the plan's "files to change" list as the footprint — _re-derive
it from the code_. Work out what implementing the plan would actually touch,
including the things the plan didn't mention: callers of the functions it
changes, tests that encode current behavior, the generated client if a route
or schema moves, a second write/read path for the same data, migrations.

For a small plan, `rg` / `Read` directly. For one that spans files or layers,
delegate to parallel `Explore` agents (read-only) — one per area — each
asked to (a) confirm the plan's specific assertions (`file:line`, signature,
"X exists") and (b) surface adjacent touch points the plan omits. Match
effort to surface area; don't six-agent a three-file plan.

For each touch point, record: **what** (`file:line`), **add or change**, and
whether the plan's code assertions about it hold (confirmed / stale / wrong /
missing-from-plan).

### 3. Reconstruct the flow the footprint builds

From that footprint, state the flow it actually implements as a short ordered
narrative — origin → branches → sinks. Be faithful to what the code would do,
including awkward bits, not the plan's idealized prose. This is what you hold
up against the mental model.

### 4. Confirm the mental model and assign verdicts

If the user gave their expected flow, diff it against step 3 directly. If they
didn't, show the reconstructed flow back concisely and ask where it's wrong —
`AskUserQuestion` for the specific forks you're unsure about ("when X and Y
both exist, should it do A or B?"), or prose for an open "is this the flow?"
Never paper over a fork by guessing; an assumed expectation defeats the skill.
In an unattended session (`docs/agents/unattended.md`) the expected flow is
the ticket's; take the plan's reading of each fork, record the fork and the
reading under the plan's Open questions, and go on.

Then assign each touch point a verdict: `ok` / `creep` / `gap` / `misread` /
`wrong-key` / `heavy`. Pay special attention to every `change` (vs `add`) — confirm the
user actually wants the existing behavior altered and that callers/tests
won't break.

### 5. Report

Give the user your read — gut call first, then walk the problems worst-first,
separating "plan misread the code" from "plan's building the wrong thing,"
calling out every `change` to existing behavior, and ending on the concrete
plan edits you'd make. Talk it through; see Output for the register.

### 6. Iterate (the loop)

Ask which findings to act on (unattended: act on every footprint-vs-code
correction and on `wrong-key` / `misread` / `gap` / `heavy`, leave `creep` flagged in
the plan). For approved ones,
**edit the plan file in place** — fix stale citations, add missed touch
points, correct the flow, adjust scope, flag the risky `change`s. If a
correction opens new code questions (the fixed flow touches new files),
re-derive that slice of the footprint before declaring done. Repeat until the
footprint and the mental model agree, or the user calls it (unattended: one
pass, then stop). Keep the plan the
single source of truth — don't let the corrections live only in the chat.

## Output

Deliver it the way you'd give a colleague your read on their plan — you've
gone through it, traced it against the code, and now you're telling them what
you found. Talk it through; don't file a report.

- **Open with the gut call.** One honest line: "plan's mostly solid, but the
  matching key is wrong and that ripples." Don't bury the lede under headers.
- **Walk the problems, worst first.** For each, say what the plan does, why it
  doesn't hold, and point at the line — "it says `add_study_card` already takes
  an `answer`, and it does (`hooks/journal.py:88`) — but §3 still cites
  `routes/journal.py:90` for the route, which is at `:115` now and takes a `db` arg." Lead
  with the thing that actually bites: a `change` to existing behavior the
  user didn't sign off on, or a `wrong-key`, beats a stale line number.
- **Separate "the plan misread the code" from "the plan's building the wrong
  thing"** as you talk — they land differently and they get fixed
  differently. A colleague naturally says "two of these are just stale
  citations, easy; but this third one — you wanted phone to be the identity
  key and the plan's keying on email, that's the real one."
- **Call the adds vs the changes.** Flag every spot the plan _changes_
  existing behavior, out loud — that's where it can silently break a caller
  or a test. New code is lower stakes; say so and move on.
- **Then: "here's what I'd change in the plan."** A short list of concrete
  edits, each tied to a section.

Use the verdict words (`creep`, `gap`, `misread`, `wrong-key`, `heavy`, `change`) as
shorthand in passing if they help, not as a rigid taxonomy you fill in. If
something checked out clean, say it in a line and move on — "all the code
assertions hold, no missed callers" — don't pad an empty category. If you
couldn't verify something, say so plainly rather than asserting it.

After the user picks what to act on, make the edits and tell them what
changed in the plan, same as you'd summarize any focused edit.

## Editing the plan

- This skill **may edit the plan file** — that's the iterate half of the job —
  but only **after** surfacing findings and getting the user's direction on
  which to apply. Don't silently rewrite the plan from your own read.
- Edit surgically: fix the cited section, preserve the plan's structure and
  voice, don't reflow the whole doc.
- After editing, if a change opened new code questions (new files in scope),
  re-verify those before declaring the loop done.
- Never touch implementation files. This skill changes the _plan_, not the
  code. If you find an outright bug in existing code along the way, note it in
  one line and point at `code-review` — don't fix it here.

## Voice and writing rules

The register is **an engineer giving their read on a teammate's plan** —
spoken-through, direct, the way you'd talk at a desk after going through it.
Not a report, not a filled-in template.

- Conversational and warm. Contractions, second person ("you wanted…",
  "notice the plan…"), the occasional "the real one here is", "the catch is".
  Read it back — if it sounds like a doc, loosen it.
- Lowercase except proper nouns and code identifiers.
- No marketing words ("comprehensive", "robust", "seamless") and no
  report-speak ("This review identifies…", "Findings are categorized…").
- No restating the request back at the user — just give them your read.
- Still point at `file:line` and the plan section for every concrete claim,
  but inline, the way you'd point at a line on screen — not as a reference
  list.
- Honest about uncertainty — if you couldn't verify a claim, say "I couldn't
  pin this down" rather than asserting it either way.
- Don't pad. Talking-it-through isn't rambling; get to the thing that bites.

## Constraints

- **Keep the two error kinds distinct.** "Plan misread the code" and "plan's
  building the wrong thing" have different fixes; don't blur them into one
  pile of issues, even while talking it through.
- **Don't trust the plan's self-report.** Verify its `file:line` and
  "already exists" claims against the tree; that's half the job.
- **Don't guess the user's intent.** Reconstruct what the plan implies, then
  ask. An assumed flow is the failure mode this skill prevents.
- **Match effort to surface.** Small plan → direct `rg`/`Read`. Cross-layer
  plan → parallel `Explore` fan-out.
- **Plan is the artifact.** Land the agreed changes in the plan file, not
  just the conversation.

## When to refuse / ask

- No plan exists yet: send the user to `feature-planner` first; this skill
  has nothing to iterate on.
- Plan file is ambiguous (several in `docs/plans/`): pick the one named for
  the current branch, else the one last committed to in this branch's git
  history (file mtime is unreliable after checkout), say which you picked — or
  ask.
- User hasn't said what they expect and the plan's flow has real forks: ask
  before diffing, don't invent the expectation. Unattended: the ticket is the
  expectation; record each fork under Open questions (step 4).
- Code's already written for this plan: note that the plan stage is over and
  point at `code-review`, or `style-guide-check` from the table above.
