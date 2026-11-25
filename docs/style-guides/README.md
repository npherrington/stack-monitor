# Style Guides

How to write code in this repo, one guide per area. There are guides for the page (`web/`) only so
far; for `core/`, `server/` and `mcp/`, PLAN.md § Principles and the neighbouring code are the rule.

## Frontend (React + TypeScript + Vite)

- [`react-components.md`](./react-components.md) - Components (ui / feature / pages / layouts, props interfaces, `cva` variants named for meaning, `className` for layout only, theme tokens, text from the machine)
- [`react-providers.md`](./react-providers.md) - Context providers (what belongs in context, context vs provider files, memoised values, storage, the provider tree in `web/app.tsx`)
- [`react-hooks.md`](./react-hooks.md) - Custom hooks (categories, naming, one flow hook per feature, derive don't store, memoise what a hook returns, injectable dependencies)
- [`react-data-fetching.md`](./react-data-fetching.md) - `core/types.ts` → `web/lib/api.ts` → a `use<Thing>` hook running `useQuery`/`useMutation`; readable errors, keys, polling only while something can change, mutations, retries
- [`react-forms.md`](./react-forms.md) - Forms (react-hook-form + a zod schema above the component, shadcn `Field`s, an awaited async `onSubmit`)
- [`react-toasts.md`](./react-toasts.md) - User feedback (the Base UI toast, one toast per action, the server's message as failure copy, toasts for actions not queries)

## Writing a guide

A style guide is forward-facing guidance for code someone is about to write — not a post-mortem,
changelog, or war story. Write the rule, not how we arrived at it.

- Every example and worked example names code that exists on `main`. A guide describes how to
  write the next thing like the things already here; it never designs a feature that hasn't been
  built, because the first implementer then rewrites the guide to match what they built.
- Where a rule has no code yet, a short inline GOOD/BAD snippet in the repo's terms (a worktree, a
  service, a run) shows it, naming no file, and the section opens with one line saying the first
  implementation becomes its example.
- No incident narratives, ticket numbers, or "this broke because...". No counts of existing
  violations, no "at the time of writing", no history of what the old pattern was.
- Include mechanism only where a reader needs it to apply the rule correctly, and state it as a
  standing property of the system, not as something that happened once.
- Prefer rules, tables, and GOOD/BAD examples over prose. Link to an authoritative source rather
  than reproducing it.
- Where existing code violates a new rule, say what to do about it going forward ("convert call
  sites you touch"), not how much of it there is.
- A new guide gets a line in this index.
