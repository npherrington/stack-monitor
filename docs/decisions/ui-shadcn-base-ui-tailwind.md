# Components are shadcn on Base UI, styled with Tailwind v4

**Status:** Accepted — 2026-11

## Context

The page needs menus, dialogs, popovers, tabs, form fields, toasts and tooltips, all accessible
and keyboard-driven, in light and dark, and later in the original's pastel theme (PLAN.md step 8).
The scaffold styled itself with one hand-written stylesheet, which doesn't scale past a page. The
product app the original monitor came from uses shadcn's `base-lyra` style on Base UI with
Tailwind v4, so its patterns and its React style guides come across as they are.

## Decision

- **shadcn, style `base-lyra`, on Base UI primitives** (`@base-ui/react`). Components are copied
  into `web/components/ui/` by the CLI (`npx shadcn@4.23.0 add <name>`) and owned from then on.
  `components.json` holds the config.
- **Tailwind v4** through `@tailwindcss/vite`, with no `tailwind.config`. The theme is CSS
  variables in `web/index.css`, mapped into Tailwind by `@theme inline`; a colour in a component is
  a token (`bg-success`, `text-muted-foreground`), never a palette value.
- **Dark mode follows `prefers-color-scheme`** through `@custom-variant dark`. When the theme
  picker comes, the variant moves to a class on `<html>` and the tokens gain a theme each.
- **`cva` for variants, `cn` for merging classes, lucide for icons.** A file that exports a
  component exports nothing else, so a variants object shared outside its component gets its own
  `*-variants.ts` (`button-variants.ts`).
- How components are written is `docs/style-guides/react-components.md`.

## Alternatives rejected

- **shadcn on Radix** (its default): Base UI is maintained by the same people who made Radix and
  Material UI, and it's what that app uses, so components and guides move between the two
  unchanged.
- **A component library installed as a dependency** (MUI, Mantine, Chakra): its look and API are
  someone else's, and theming them to a pastel theme fights the library. shadcn components are
  source we can change.
- **Hand-written CSS with tokens** (the scaffold's): every component re-solves focus rings,
  popover positioning and dark mode, and none of the accessible primitives come for free.
- **CSS modules or CSS-in-JS**: runtime CSS-in-JS needs `style-src` nonces or inline styles under
  the CSP; CSS modules give no primitives. Tailwind's output is one static stylesheet.

## Consequences

- Upgrading a shadcn component is re-running `add` and merging by hand: the copy is ours.
- Generated components arrive in shadcn's formatting and imports; run `mise run format` and point
  `cn` at `@/lib/utils.ts` after adding one.
- `base-lyra` is square-cornered and dense (`text-xs` controls), which suits a tool page.
- The CSS bundle carries Tailwind's preflight and shadcn's base layer, about 25 kB before gzip.
