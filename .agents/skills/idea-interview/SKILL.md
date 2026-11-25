---
name: idea-interview
description: Take a loose feature idea to something buildable. Reads the code it touches, interviews the user on what the code can't answer, then draws its feature map as a Mermaid diagram and files its GitHub issue. Use when someone describes a feature in a sentence or two or says "I want to build X".
---

# Idea Interview

Take a loose idea and get it to the point where someone could build it: **ground** it in the code
and PLAN.md, ask the user only what those can't answer, and hand over a recap, a feature map and an
issue.

Your job is to find what hasn't been decided and have the user decide it. The grounding is what
makes a question worth answering: each one is something only this user can answer, about this
codebase as it is.

## 1. Ground

Read what the idea touches before the first question.

- Name the idea's **nouns**: the things it reads, changes or shows (a checkout, a service, a run, a
  schedule, the config).
- For each noun, find what exists: its section in `core/config/schema.ts`, its module in `core/`,
  its route in `server/routes.ts`, its page in `web/`, its MCP tool. `code-base-scanner` traces one
  that crosses layers. A noun PLAN.md describes but the tree doesn't have yet gets PLAN.md's section
  beside it, marked planned.
- Find the **nearest feature**: what's already built, or planned in PLAN.md, that this most
  resembles. How it handles refusals, failure, the MCP server and tests is this idea's default.
- Read PLAN.md's Principles, the module the idea lands in, its Steps and Open decisions, and the
  records in `docs/decisions/` for anything the idea would add or change.
- Search the issues for one that already covers it, open or closed, as
  `docs/agents/issue-tracker.md` lists them. When `gh auth status` fails, say the search wasn't
  done.

An issue or a built feature that already covers the idea comes before any question: say what you
found and ask whether this is a change to it. An idea with nothing like it in the repo has no
nearest feature: say so, and expect more of it to land in Ask.

**Done when** every noun has a path beside it, a PLAN.md section, or "nothing yet"; the nearest
feature is named or there is none; and you can list the layers the idea runs through.

## 2. Sort

Put everything undecided about the idea in one of three bins:

- **Found**: the code or PLAN.md settles it (which module it belongs to, whether a route already
  answers it, what a principle rules out).
- **Assumed**: the repo has a convention, or the nearest feature does it one way, and nothing in the
  idea argues against it.
- **Ask**: a decision that changes what gets built and that only the user can make. This bin is the
  **frontier**.

The test for Ask: name what each answer would change in the build. Both answers lead to the same
build, or the user would have to open the code to answer: it's Assumed or Found.

Then open with what you read, in one message:

```markdown
**What's there**

- <noun>: <what exists> (`path`, or PLAN.md § <section>)
- Nearest feature: <name> (`path`)

**Assuming, unless you say otherwise**

- <the default>, as <the nearest feature> does (`path`)

<the first question>
```

**Done when** that message is sent, with every Found and Assumed item in it and one question under
them.

## 3. Interview

**One question per message**, the most consequential one on the frontier. One question gets a
proper answer; a batch gets skimmed, and the one that mattered gets half of one.

- Each question carries the fact that makes it a question, and where you read it: "Removing a
  worktree refuses while a dev server runs in it. Same for this, or does it stop the server first?"
- Each question is one thing, in plain words: "What does the page show if it fails?"
- Where the realistic answers are a short closed set, offer them, through `AskUserQuestion` when
  it's a true multiple choice.
- Order by dependency: the question whose answer removes the most other questions goes first.
- **Re-sort after every answer.** It closes branches and opens others. When it opens code you
  haven't read, read that before asking about it.
- **Stop when the frontier is empty**, and say so. When the user stops first, go to the recap with
  the rest of the frontier under Still open.

Rules that hold throughout:

- **Ask, don't design.** Offering the realistic options is a question; "we could do X" is a design,
  and the moment you offer one they react to yours instead of building theirs.
- **"I don't know" is an answer.** Park it as an open question and move on.
- **Push back when answers disagree.** Say which two, and ask which is true.
- **Their scope.** What they call out of scope is a non-goal: note it and leave it.
- **Their assumptions too.** One they correct moves to Decided, and the frontier is re-sorted around
  it.
- **Nothing is written** until the recap is accepted: the half-interviewed version is the expensive
  one to build.

### Where decisions hide

Where the Ask bin usually fills from. Take each through step 2's test before asking it; for any
given idea, most are Found or Assumed.

- **What and who**: the moment this happens in, in their words. Whether it's for every repo or one
  a repo turns on in its config, and what it does with the section left out. The smallest version
  worth shipping, and what v1 leaves out.
- **Mechanics**: what it reads from the machine, and whether anything has to be kept on disk
  (PLAN.md keeps only schedules and run logs). What the monitor refuses when it can't check the
  state. Whether the MCP server gets it too, and whether it spends money (PLAN.md keeps runs that
  spend money on the page). What it runs or signals, and in which checkout. Whether the user waits
  for it or sees it later.
- **Edges**: what the page shows when it fails. Two checkouts at once, or the page open in two tabs.
  A checkout removed mid-way. The monitor restarted mid-way. A process outside the checkout holding
  what it needs. Anything irreversible: a branch deleted, a container's data gone.
- **Shipping**: which of PLAN.md's steps it belongs to, or whether it's a new one. macOS only, or
  Linux too.

### What talking can't answer

Name these, say what would answer them, and move on:

| Question                                       | What answers it                                      |
| ---------------------------------------------- | ---------------------------------------------------- |
| "How should this feel? Does this layout work?" | Build it and look at it on the page (`mise run dev`) |
| "Will people use it?"                          | Ask a few of them                                    |
| "Is this fast enough?"                         | Measure it against a clone with a lot of worktrees   |
| "Which of these two flows is better?"          | A prototype of both                                  |

## 4. Recap

In chat:

```markdown
**Building:** <two sentences, the version they landed on>

**Decided**

- <one line per decision, the corrected assumptions among them>

**Assumed**

- <the defaults nobody challenged, each with the feature it follows>

**Not doing**

- <the non-goals>

**Still open**

- <every "I don't know", and who or what would answer it>

**Needs a prototype**

- <what talking couldn't answer>
```

Then one `AskUserQuestion`: the feature map and then the issue (recommended), the issue alone, or
stop here.

**Done when** the user has accepted the recap, or corrected it and seen it again, and chosen.

## 5. Feature map

Read [`FEATURE-MAP.md`](FEATURE-MAP.md) and follow it: the recap becomes a Mermaid diagram of the
layers the feature runs through, in a markdown file the issue carries.

**Done when** the user has said the map is right, and you hold the path of the file that has it.

## 6. Issue

Run `github-issue` with the recap as its request and the code read in step 1 as its step 2:

- **Building** opens the body; **Decided** and **Assumed** feed Scope and Approach.
- **Not doing** is Scope's Out.
- **Still open** and **Needs a prototype** are its Decisions, each with your recommendation, so an
  issue with either stays off `ready-for-agent` until the user answers.
- The feature map file's contents go in the body after Approach, so GitHub renders the diagram.

**Done when** `github-issue` has returned the issue's number and URL, or shown the draft the user
decided to leave unfiled.

## Voice

Ask like an engineer about to build it. Short questions, plain words, the next question straight
after the answer.
