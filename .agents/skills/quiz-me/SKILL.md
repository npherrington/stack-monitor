---
name: quiz-me
description: Quiz the user on how this codebase works. Picks a topic at random, verifies the real answer in the code first, asks one question, marks the answer honestly, and teaches the mechanism with file references when they don't have it. Keeps a gitignored history, one file per session under `.quiz-me/`, so it doesn't repeat itself and can chase the gaps. Never edits source. Use when asked to quiz me, test me on the codebase, or to learn an unfamiliar area of the repo.
---

# Quiz Me

Ask the user one question about how this repo works, mark their answer, and teach them the bit they
didn't have. Repeat while they want to keep going.

The point is recall and mechanism ("what happens when a page on another site posts to the
monitor?"), not trivia. Nobody needs to memorise line numbers.

## The one rule that matters

**Find the answer in the code before you ask the question.** Every time. Read the files, follow the
calls, hold the real mechanism with file:line references in hand, _then_ ask.

Ask first and you'll grade a correct answer as wrong because it didn't match what you assumed, or
teach a mechanism this repo doesn't have. Both are worse than not running the quiz. If the answer
turns out murky, or the code contradicts itself, drop that question, pick another, and mention what
you found: that's a real finding about the codebase.

This skill holds no answers on purpose. Code changes; a baked-in answer key would teach yesterday's
system.

## Where the history lives

`.quiz-me/` at the repo root, **one file per session**, named for when it started:

```
.quiz-me/2026-09-01-1042.md
.quiz-me/2026-08-28-0915.md
```

Get the name from `date +%Y-%m-%d-%H%M` at the first round, and keep that one file for the whole
session. Every round appends to it.

The directory is gitignored (the root `.gitignore`), so it stays on the machine it was written on:
nobody else sees what you were asked or how you did, and none of it lands in a PR. Keep it there,
uncommitted, and read only your own.

Each worktree has its own copy, so a fresh worktree starts from a blank history.

## Running a round

### 1. Read the history, then pick a topic

Two cheap reads cover it:

```bash
# what's been asked, ever: one line each
grep -h '^\*\*Q:\*\*\|^## ' .quiz-me/*.md 2>/dev/null | tail -40

# the last couple of sessions in full, for how they did
ls -t .quiz-me/*.md 2>/dev/null | head -2
```

Use it to steer the pick:

- **Fresh questions.** Re-ask only an area they got wrong, once enough time has passed to make a
  retest worth it: coming back to a mechanism they missed a fortnight ago is the most useful
  question you can ask.
- **Chase the gaps.** Areas with wrong answers deserve another angle; areas never asked about
  deserve a first one.
- An explicit request beats the history.

If the user named an area (`/quiz-me server`) or a difficulty (`/quiz-me hard`), honour it.
Otherwise pick at random, genuinely random rather than whatever's in context, which is how you end
up asking about the same three files forever:

```bash
# a random topic from the bank below
awk 'BEGIN{srand()} {a[NR]=$0} END{print a[int(rand()*NR)+1]}' <<'EOF'
host and origin checks
route input parsing
body size cap
serving the page
config lookup order
the json schema export
run() and failed commands
the primary checkout
the monitor's port
what mise run check runs
EOF

# or ground it in a real file
git ls-files 'core/**/*.ts' 'server/**/*.ts' 'web/**/*.ts*' 'scripts/*' 'mise.toml' \
  | awk 'BEGIN{srand()} {a[NR]=$0} END{print a[int(rand()*NR)+1]}'
```

Pick a topic not yet asked this session. If they've been in one area all session, deliberately go
elsewhere: the value is in the corners they haven't touched.

### 2. Learn the answer

Read the real code end to end: where it's triggered, what it calls, what happens on the failure
path. Note the file:line references you'll cite. Note _why_ it's built that way when a comment,
PLAN.md or a record in `docs/decisions/` says.

### 3. Ask

One question, plain words. Open-ended unless they ask for multiple choice: recognising the right
answer is far easier than recalling it, and easy is not the point.

Keep the answer out of the question. "How does the Host check stop DNS rebinding?" has given away
three-quarters of it; "why does the server care what Host a request names?" hasn't.

Say what area it's from so they're not guessing blind ("server, request checks"), then stop and
wait. Hints only when they ask for one.

### 4. Mark it honestly

| Verdict                    | When                                                    |
| -------------------------- | ------------------------------------------------------- |
| **Right**                  | The mechanism is correct, even if the words differ      |
| **Right, missing a piece** | Core mechanism right, missed a consequence that matters |
| **Half right**             | Right instinct, wrong mechanism                         |
| **Wrong**                  | It doesn't work like that                               |
| **Don't know**             | They said so: no penalty, go straight to teaching       |

Mark the substance, not the vocabulary. Someone who says "it won't take JSON from another site
without asking first, and it never says yes" has the preflight point even without the word.

Mark it straight. "Close!" for a wrong answer teaches a wrong thing and wastes the round: say "no, it
doesn't work like that" and explain. Wrong answers are the reason to run the quiz, so no piling on
either.

If they're right, say what's right and add the one thing they'd want to know next, in a sentence or
two.

### 5. Teach the gap

Only when they got it wrong or half right:

- **Show the real code.** Quote the few lines that carry the mechanism, with `server/http.ts:59`
  style references they can click.
- **Explain it plainly**, the way you would at their desk. Concrete over abstract. A sentence that
  needs a second read gets rewritten.
- **Say why it's built that way**: the constraint that forced it. That's the part that sticks, and
  the part that stops them "simplifying" it later.
- **Say what breaks if you get it wrong.** The consequence is the memory hook: "drop the Origin
  check and any tab you have open can click Stop for you."
- **Then check it landed** with one follow-up about the same mechanism, slightly to the side of
  what you explained.

### 6. Record it

Append the round to this session's file, creating it on the first round:

```markdown
# Quiz session: 2026-09-01 10:42

## server / request checks: medium

**Q:** why does the server care what Host a request names?
**Answered:** thought it was about running more than one monitor
**Verdict:** wrong
**Gap:** it stops DNS rebinding: a site whose name resolves to 127.0.0.1 would otherwise be
same-origin with the monitor and could read its answers
**Refs:** server/http.ts:59
```

Six lines per round. It's a memory aid for the next session, not a transcript: summarise their
answer and leave the teaching out (the refs lead back to it).

Write it after each round, so an interrupted session still leaves behind what it covered.

### 7. Next

Ask if they want another. If they ask how they're doing, read back over the history and give it
straight: what's solid, what keeps coming back wrong, which areas have never come up.

## Difficulty

- **Easy**: where it lives, what calls what. "Where does the page get the list of modules from?"
- **Medium**: a flow end to end, failure path included. "Walk me through what happens when
  `STACK_MONITOR_CONFIG` names a file that isn't there."
- **Hard**: why it's built this way, and what breaks if you change it. "Why does a POST have to be
  `application/json`, when the route would parse the body either way?"

Default to medium. Move up when they're getting things right, down when they're not.

## What makes a good question

- It has a definite answer in the code today.
- Getting it wrong in real life would cause a bug, a security hole, or a wasted afternoon.
- It's about a mechanism, never an exact line number, variable name or spelling.
- It's answerable in a few sentences. One that needs a diagram is an explanation.
- A lucky guess or the question's own wording can't answer it.

## Topic bank

Areas with real mechanisms worth knowing. Not an answer key: read the code before asking about any
of them. PLAN.md names modules (stack, agents, schedules, feature map, the MCP server) that land one
step at a time; ask about one only once its code is in the tree.

**Server** (`server/`): the Host, Origin and Content-Type checks and what each one stops; `route()`
and what a request that doesn't fit the zod schema gets; the body size cap and why the body is read
to its end even once it's over; how the page is served, the path that tries to climb out of `dist/`,
and what a request gets before the page is built; which response carries the page's CSP and why only
that one; the headers every response gets.

**Core** (`core/`): where the config is looked for and in what order, and why a set
`STACK_MONITOR_CONFIG` never falls through to another file; what you get with no config at all; why
it's read on every request; `run()` and why it never rejects; how the primary checkout is found from
any checkout or folder inside one, and why paths are made canonical; what `core/types.ts` may import
and why; why core/ and mcp/ may only write to stderr.

**Page** (`web/`): how it reaches the server and what it shows when the monitor isn't answering; why
the router keeps its routes in the hash (`vite.config.ts`); whatever data fetching, forms or toasts
the page has by the time you ask.

**Tooling**: what `mise run check` runs and that CI runs the same; how mise skips `sync` and `build`
when nothing changed; what pins the toolchain; the test that fails when the JSON Schema is stale;
what `mise run worktree` does with a branch that's only on origin; what happens on `mise run dev`
when the port is already taken.

## Constraints

- **The codebase is read-only.** The only files this skill writes are its own session files under
  `.quiz-me/`: no source edits, no commits, no `git add` of the quiz directory.
- **One question at a time.** They answer, you mark, you teach.
- **Only verified answers.** A question you didn't check in the code this session doesn't get asked
  or marked.
- **Quiz the code, not the style guides.** Rules live in `docs/style-guides/`, and looking them up is
  the correct behaviour.
- **Finish the round first.** A bug spotted while finding an answer gets mentioned after the round,
  separately.

## Voice

- A colleague at a whiteboard, not an examiner. Short questions.
- Straight in: no preamble, no "great question", no praise for participating.
- Plain language over jargon.
- Direct about wrong answers, generous with the explanation after.
