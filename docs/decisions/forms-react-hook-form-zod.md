# Forms are react-hook-form with a zod schema

**Status:** Accepted — 2026-11

## Context

Forms are coming with step 1 onwards: add a repo, create a worktree (branch, base, index), start a
run (agent, model, effort, prompt or workflow, arguments checked against the repo's patterns), save
a schedule of up to four steps. They validate as you type, show errors beside fields, and submit to
routes that validate again. The server already validates with zod (`core/config/schema.ts`), and
zod is already a dependency.

## Decision

**react-hook-form, with `@hookform/resolvers/zod`** and a zod schema defined above the component,
rendered with shadcn's form field components on Base UI. Where a route's body has a schema in
`core/`, the form reuses it or derives from it rather than restating the rules. How forms are
written is `docs/style-guides/react-forms.md`.

## Alternatives rejected

- **Controlled inputs with `useState` per field**: validation, touched state and error display
  hand-rolled per form, and a re-render per keystroke for the whole form.
- **TanStack Form**: a good fit beside TanStack Query, but younger, and shadcn's form components
  and the ported guides are written for react-hook-form.
- **Validation only on the server**: errors arrive after a round trip, and a create that runs a
  `setup` hook is slow to answer.

## Consequences

- Two dependencies (`react-hook-form`, `@hookform/resolvers`) installed before the first form, so
  the guide and the stack agree from the start.
- A schema the page and the server share has to live in Node-free code the page can import.
