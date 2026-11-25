---
name: style-guide-check
description: Read-only audit of files against `docs/style-guides/`, citing the guide section for each violation. Use when asked to check files against the style guides, or to audit a branch or PR before code review.
---

# Guide Audit

Audit the files the user provides against the rules documented in
`docs/style-guides/`. Report violations with citations. Stay strict: only flag
documented rules. Opinions not in any guide are not violations: they belong
in the "patterns worth considering" section if they're a pattern across the
audit, or omitted entirely.

## Workflow

### 1. Determine input

The user provides one or more file paths, or names a branch (branch mode
below). If neither was given, ask before proceeding. If a path doesn't
exist, skip it and note in the output.

Keep the input to what was named: the whole repo is never the input, and the
whole branch only in branch mode. Broad scans produce low-signal noise.

**Branch mode.** When the request names a branch or PR ("audit this branch",
"before review", or a caller passing its branch), the input is every file
the branch touches: `git diff --name-only origin/main...HEAD` plus the
working tree. Audit each of those files **whole**, not just its changed
lines: a reviewer reads the file, and a new function that copies an old one
three screens up is only visible from there. Step 4b applies in this mode.

### 2. Route each file to the relevant style guides

Apply guides based on file path and extension. Read ONLY the guides that
match; don't load every guide.

| File pattern                                                                                 | Applicable guides                               |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `web/**/*.{ts,tsx}`                                                                          | `react-hooks.md`, `react-data-fetching.md`      |
| `web/components/**/*.tsx`                                                                    | also `react-components.md`                      |
| `web/{contexts,providers}/**`, `web/app.tsx`, `web/main.tsx`                                 | also `react-providers.md`                       |
| `web/**/*.tsx` with a form (a field and a submit)                                            | also `react-forms.md`                           |
| `web/**/*.tsx` reporting an action's outcome (success, failure, nothing happened)            | also `react-toasts.md`                          |
| `docs/style-guides/*.md`                                                                     | `docs/style-guides/README.md` § Writing a guide |
| `core/**`, `server/**`, `mcp/**`, `tests/**`, `scripts/**`, `.github/**`, `.claude/hooks/**` | none yet                                        |

`react-data-fetching.md` covers the fetch layer in `web/lib/api.ts` as well
as the hooks that call it.

A file that matches no pattern, or only the "none yet" row, gets `no
applicable style guides for this file` and is skipped. Do not invent rules,
and leave PLAN.md § Principles to the reviewer that called you: this audit is
the guides only.

### 3. Read the target files and the routed guides

Read each target file in full. Read each applicable guide in full as it is
on `origin/main` (`git show origin/main:docs/style-guides/<file>`): a branch that
edits a guide is audited against the rule it started from, not the one it
wrote. If the guide or the cited section isn't on `origin/main` (a guide
added on this branch, or a stale fetch), audit against the working-tree copy
and say so in the output.

### 4. Cross-reference

For each file, identify violations. Each violation MUST cite:

- The specific guide (`react-components.md`, etc.)
- The section / rule within it (quote enough text that a reader can find it)
- The exact line(s) in the target file
- A concrete suggested fix

If you can't cite a specific guide section, it's not a violation. Move it
to "patterns worth considering" if it's a real pattern across the audit;
otherwise drop it.

### 4b. Look outside the file for what already exists (branch mode)

Some rules can't be judged from inside one file: a rule to reuse a hook, a
primitive or a fetch helper rather than write another, or to put a thing in
one named place. For each **new** component, hook, provider, `web/lib/`
function or `web/components/ui/` primitive the branch adds, search the repo
for the same shape before calling it clean:

- the call it wraps (`rg "getJson\('/api/config"`)
- a hook with the same query or route (`rg "/api/<path>" web/`)
- a component or primitive with the same job in `web/components/ui/` or a
  sibling feature folder

A second copy of the same shape is a violation of the rule it duplicates
against; cite both locations and say which existing one to reuse or where
the shared one should live.

### 5. Surface undocumented patterns (CLAUDE.md § Style Guides, "Suggesting a guide", operationalized)

While auditing, if you notice:

- A pattern used consistently across the files that isn't in any guide
- A pattern that conflicts with the documented style
- A pattern that would clearly benefit a future reader if documented

…surface it in a separate `Patterns worth considering for new style guide
entries` section at the end of the output. Be specific: name the pattern,
where you saw it, and suggest which guide it might belong in (or whether
it warrants a new guide, as for `core/`, `server/` and `mcp/`, which have
none).

Stay calibrated and keep this section short. If nothing genuinely worth
documenting came up, omit the section entirely.

## Output format

```
## Style guide audit

### web/components/<feature>/<file>.tsx
- `<guide>.md` §"<section>": <the rule, quoted or closely paraphrased>
  - Line 14: <what the line does that breaks it>
  - Suggested fix: <the change, naming the existing hook, primitive or file to use>

- `<guide>.md` §"<section>": <rule>
  - 3 occurrences (lines: 22, 40, 61): <what they share>
  - Suggested fix: <the change>

### web/hooks/<file>.ts
(no violations)

### core/<module>/<file>.ts
no applicable style guides for this file

## Patterns worth considering for new style guide entries

- <the pattern>, in <n> of the audited files (`<file>:<line>`). No guide covers it; suggest adding
  it to `<guide>.md`, or a new guide for `<area>`.
```

## Voice and writing rules

Follow `commit-message` § Voice. No preamble before the markdown, no footer or trailer.

When describing a violation, write it the way a senior engineer would in
a code review comment: terse, specific, with the citation right there so
the reader doesn't have to hunt.

## Constraints

- **Documented rules only.** If a rule isn't in a guide file, it isn't a
  violation. Your own style opinions are not the contract.
- **One file per subsection.** Keep each file's findings under its own heading.
- **Quote the guide.** When citing a section, include enough text for the
  reader to locate it without re-reading the whole guide.
- **Read-only.** This skill reports; the caller applies fixes, in a separate
  edit pass after reviewing the findings.
- **Calibrate severity by frequency.** If a file violates one rule five
  times, list it once with `5 occurrences (lines: 12, 34, 56, 78, 99)`.

## When to refuse / ask

- No file paths and no branch in the request: ask which files.
- Path doesn't exist: skip it and note in the output; the rest of the audit
  goes on.
- File matches no style guide: report `no applicable style guides for
this file` and move on.
- A user provides >20 files in one request: ask whether to proceed (the
  per-file read cost adds up; offer to chunk). When another skill or agent
  invoked this one, proceed: there is no one to ask.
