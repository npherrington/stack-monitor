# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/decisions/`**: read the decision records that touch the area you're about to work in. `docs/decisions/README.md` indexes them.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/
│   └── decisions/
│       ├── README.md
│       └── <one file per decision>.md
└── ...
```

New decision records go in `docs/decisions/`, in the format `domain-modeling`'s `ADR-FORMAT.md` gives (Status line, then Context, Decision, Alternatives rejected, Consequences). Do not create `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts an existing decision record, surface it explicitly rather than silently overriding:

> _Contradicts docs/decisions/<file>.md, but worth reopening because…_
