# Out-of-Scope Records

`.out-of-scope/` at the repo root holds one file per **rejected enhancement request**. It is created lazily, on the first rejection.

It does two jobs:

1. **Memory**: why a request was rejected, so the reasoning survives the issue being closed.
2. **Deduplication**: when a new issue matches a prior rejection, triage surfaces the earlier decision instead of re-litigating it.

It is not `docs/decisions/`. `docs/decisions/` records how the tool is built; `.out-of-scope/` records requests we said no to.

## File format

One file per **concept**, not per issue, in a relaxed, readable style: a short design note, not a database row. Name it in kebab-case so it can be recognised without opening it: `remote-access.md`.

```markdown
# Remote access

The monitor answers only on 127.0.0.1; we don't serve it to other machines.

## Why this is out of scope

The reason, in substance: the constraint, the strategy, or the trade-off. Not "we're busy": that's a deferral,
not a rejection.

## Prior requests

- #123: "Let me check my worktrees from my laptop"
- #210: "Serve the page on the LAN so the team can see it"
```

## When to check

During triage step 1, read every file in `.out-of-scope/`. Match by concept, not keyword: "check my worktrees from my laptop" matches `remote-access.md`. On a match, surface it: "This looks like `.out-of-scope/remote-access.md`: we rejected it because [reason]. Still the case?" The maintainer can:

- **Confirm**: append the new issue to "Prior requests", then close it
- **Reconsider**: delete or update the file; the issue proceeds through normal triage
- **Disagree**: related but distinct; normal triage

## When to write

Only when an **enhancement** is rejected as `wontfix`. Not for bugs, and not when it's closed as **already implemented**: that's a built feature, and recording it would poison the dedup check. Point to where it lives in the closing comment instead.

1. Check for an existing matching file; if there is one, append to "Prior requests".
2. Otherwise create the file with the concept, reason, and first prior request.
3. Comment on the issue explaining the decision and linking the file, then add `wontfix` and close it with `gh issue close <n> --reason "not planned"`.

If the maintainer later changes their mind, delete the file. Old issues stay closed: they're history.
