# ADR Format

Decision records live in `docs/decisions/`, one file per decision, named `<area>-<choice>.md` (e.g. `cache-redis.md`). Add a row to `docs/decisions/README.md`'s index if it has one. Read two or three existing records first, if there are any, and match their voice.

## Template

```md
# {Short title of the decision}

**Status:** Accepted — YYYY-MM

## Context

{What forced the decision. The situation, not the history of the codebase.}

## Decision

{What we chose, in one or two paragraphs.}

## Alternatives rejected

{Each real alternative and why it lost. Skip anything nobody would propose.}

## Consequences

{What is now true that wasn't — including the costs we accepted.}
```

Aim for 40–80 lines. Past 150 it has become a design doc, not a decision record.

## Status

`Accepted — YYYY-MM`, `Proposed`, `Superseded by [other-file.md]`, or `Reversed — YYYY-MM`. A record is written once and amended only to change its `Status`. If the reasoning turns out to be wrong, write a new record that supersedes the old one.

## When to offer an ADR

All three of these must be true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If a decision is easy to reverse, skip it — you'll just reverse it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record beyond "we did the obvious thing."

### What qualifies

- **Architectural shape.** "Celery for background work." "Subscription state is computed on read."
- **Technology choices that carry lock-in.** Database, auth provider, hosting, payment or messaging vendor. Not every library — just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** Which layer owns a piece of data. The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** Compliance, vendor contracts, platform limits.
- **Rejected alternatives when the rejection is non-obvious.**

Not for rules about code you're about to write (`docs/style-guides/`) or what a feature does.
