# React Components

Applies to: `web/components/**`, every `.tsx` file that renders UI.

A component renders. It takes props, reads what it needs from hooks, and returns markup. Data
fetching lives in hooks (`docs/style-guides/react-data-fetching.md`), shared state in providers
(`docs/style-guides/react-providers.md`), and logic worth naming in a hook of its own
(`docs/style-guides/react-hooks.md`).

---

## Where a Component Lives

```
web/components/
├── ui/                 # design-system primitives: button.tsx, card.tsx, status-dot.tsx
├── <feature>/          # components for one feature: config/config-summary.tsx
├── pages/              # one per route: overview.tsx
└── layouts/            # app shell, nav, page chrome: app-shell.tsx
```

| Folder       | May                                                                                    | May not                                  |
| ------------ | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| `ui/`        | take props, use the theme, compose other `ui/` components                              | call a data hook, or import from `core/` |
| `<feature>/` | call data hooks, use the types in `core/types.ts`, compose `ui/`                       | be imported by `ui/`                     |
| `pages/`     | read route params, compose feature components, own the page's loading and error states | hold logic a feature component could own |
| `layouts/`   | render chrome around an `<Outlet />` (`app-shell.tsx`)                                 | fetch page data                          |

- **`ui/` knows nothing about the domain.** `StatusDot` takes `state: 'on' | 'off'`;
  `ConfigSummary` in `config/` decides that a module turned on reads as `on`. A primitive that
  starts importing from `core/types.ts` belongs in a feature folder.
- **Reach for a primitive before a native element.** Add a shadcn component to `ui/`
  (`npx shadcn@4.23.0 add <name>`) rather than styling a bare `<button>` or `<input>` in a feature
  component. The CLI writes shadcn's formatting and extensionless imports: run `mise run format`
  and give its imports their `.ts`/`.tsx` extensions, `cn` from `@/lib/utils.ts`.
- **A component used by one feature stays in that feature's folder.** Move it to `ui/` when a
  second feature needs it and you've stripped the domain out of it.

---

## Files and Exports

- **File names are kebab-case**: `config-summary.tsx`, `app-shell.tsx`. The component inside is
  PascalCase: `ConfigSummary`, `AppShell`.
- **Named exports everywhere.** Feature components and pages export the function
  (`export function Overview()`); `ui/` primitives keep the shape the shadcn CLI generates
  (`export { Button }`).
- **One exported component per file.** Small private helpers and constants the component uses sit
  in the same file, unexported (`MODULE_LABELS` in `config-summary.tsx`).
- **A component file exports only components.** Vite's fast refresh keeps state only in files
  that export nothing else, and eslint's react-refresh rule flags the rest. A variants object
  used outside its component gets its own `*-variants.ts` (`button-variants.ts`), hooks go in
  `web/hooks/`, other shared values in a `.ts` file beside the component.
- **Imports name their extension.** `@/` reaches into `web/` (`@/components/ui/card.tsx`); the
  shared types come from `core/types.ts` by relative path (`config-summary.tsx`), since `@/` stops
  at `web/`.

---

## Props

Declare the props as an interface named `<Component>Props`, directly above the component, and
destructure them in the signature.

```tsx
// config/config-summary.tsx
interface ConfigSummaryProps {
  status: ConfigStatus
}

export function ConfigSummary({ status }: ConfigSummaryProps) {
  // ...
}
```

- **Defaults go in the destructuring** (`variant = 'default'` in `Button`), not in a
  `defaultProps` or an `??` further down.
- **Take the record, not five of its fields**, when the component is about that record:
  `ConfigSummary` takes the whole `ConfigStatus`. Take primitives when it's a reusable piece that
  shouldn't know the record exists.
- **Extend the native element's props for a primitive** so callers get `aria-*`, `id` and event
  handlers for free: `Card` takes `React.ComponentProps<'div'>`, `Button` takes
  `ButtonPrimitive.Props`.

### Callbacks that take nothing are `NoArgCallback`

No component takes one yet; the first one adds `web/lib/callbacks.ts` and becomes the example.

When a component hands a no-argument callback prop to a DOM event prop (`onClick`, `onFocus`,
`onBlur`), type the prop as `NoArgCallback` (`type NoArgCallback = (arg?: never) => void`) and
call it with no arguments.

TypeScript accepts a zero-arg function wherever an event handler is expected, so
`onClick={onStop}` compiles against `() => void` and hands the click event to a callback that
never asked for it. If that callback later gains an optional parameter, it silently receives a
`MouseEvent`. `NoArgCallback` makes that line a type error.

```tsx
// GOOD
interface StopButtonProps {
  onStop: NoArgCallback
}
const button = <Button onClick={() => onStop()} />

// BAD: compiles, and forwards the MouseEvent
interface StopButtonProps {
  onStop: () => void
}
const button = <Button onClick={onStop} />
```

A callback whose return value matters (an async `onConfirm` the component awaits) is typed
`() => Promise<void>` instead.

---

## A Component Owns Its Appearance

Callers pick from options the component defines; they don't pass styles that override it.

One-off overrides multiply: each is a separate place the component's look can drift, none of
them are visible from the component itself, and changing the component means finding every call
site that quietly disagrees with it. A need expressed as a prop lives in one file, where it can be
named, reused and changed once.

### Variants come from `cva`

A primitive with more than one look defines them with `class-variance-authority` and types its
props from the result:

```tsx
// ui/status-dot.tsx
const statusDotVariants = cva('size-2 shrink-0 rounded-full', {
  variants: {
    state: {
      on: 'bg-success',
      off: 'bg-muted-foreground/50',
    },
  },
})

interface StatusDotProps extends VariantProps<typeof statusDotVariants> {
  className?: string
}

export function StatusDot({ state, className }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(statusDotVariants({ state }), className)}
    />
  )
}
```

| Situation                                      | Do                                     |
| ---------------------------------------------- | -------------------------------------- |
| A look needed more than once                   | add a variant or prop to the component |
| A look that expresses a state or meaning       | add a variant, named for the meaning   |
| Needed once, and it's about position           | `className` from the parent (below)    |
| Reproducing a variant's classes at a call site | change the variant instead             |

### Name variants for meaning, not appearance

`state="on"`, `variant="destructive"`, not `variant="green"` or `variant="red"`. A semantic name
survives a redesign and the pastel theme; a literal one has to be found and rewritten when green
stops meaning up. A boolean that means "look different" (`big`, `isRed`) should be a variant with
a name.

### Map domain values to variants in the feature component

The same holds for any prop a domain value picks. `ConfigSummary` maps each module to a label and
to `StatusDot`'s `state`:

```tsx
// config/config-summary.tsx
const MODULE_LABELS: Record<ModuleName, string> = {
  worktrees: 'Worktrees',
  stack: 'Stack',
  agents: 'Agents',
  featureMap: 'Feature map',
}

// ...
const state = status.modules[name] ? 'on' : 'off'
<StatusDot state={state} />
{MODULE_LABELS[name]}
```

A `Record` over the union is exhaustive: when `MODULE_NAMES` in `core/types.ts` gains a module,
this file stops compiling until it's labelled. A `switch` with a `default` hides the new value.

### `className` is for layout, not appearance

Every primitive accepts `className` and merges it last with `cn()`, so a parent can place it. Use
it for how the component sits among its siblings (`<CardContent className="grid gap-4">` in
`config-summary.tsx`), never for how it looks.

| Fine                                                                     | Not fine                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `mt-4`, `w-full`, `max-w-md`, `col-span-2`, `self-end`, `hidden md:flex` | `bg-*`, `text-<colour>`, `font-*`, `text-<size>`, `rounded-*`, `border-<colour>` |

Prefer solving spacing on the parent anyway: a `gap-4` on the container beats an `mb-4` on each
child.

### Colour comes from the theme

Colour comes from the theme's tokens (`bg-primary`, `text-muted-foreground`, `bg-success`),
defined as CSS variables in `web/index.css` and mapped into Tailwind by its `@theme inline`, so a
re-theme or dark mode changes it in one place. A new meaning gets a token there, with a light and a
dark value, as `--success` ("a service or module that's up or on") has. Hex values, `rgb()`,
arbitrary colours (`text-[#e11d48]`) and palette colours (`bg-red-500`) stay out of components.

Dark mode is the variable's dark value in `web/index.css`, or the `dark:` variant on a token, which
`@custom-variant dark` there points at the system setting. It is never an `isDark ? '…' : '…'`
ternary in the component: a ternary re-renders on toggle, can't be read from the class list, and
drifts from the variables.

---

## Rendering

- **Keys are stable ids** from the data (`key={name}` in `config-summary.tsx`, a checkout's path),
  never the array index. An index key hands one row's state (an open menu, a half-typed input) to
  another when the list reorders.
- **Conditionals render on a boolean.** `{count > 0 && <Badge />}`, not `{count && <Badge />}`,
  which renders a literal `0`.
- **Every data-driven region has three states**: loading (a `Skeleton` the shape of the content,
  as `overview.tsx` shows), error (a message in place of the content, with
  `role="alert"`, as there too), and empty (say there's nothing yet, and what would add
  something). A page that only handles success shows a blank screen for the other two.
- **Text from the machine renders as a text child.** Branch names, log lines and agents' reports
  are strings someone else wrote; React escapes a text child, so markup in them shows as markup.
  `dangerouslySetInnerHTML` takes only the output of a sanitiser. The CSP in `server/static.ts` is
  the second line, not the first.
- **Keep the body about rendering.** More than a few lines of state and effects is a hook waiting
  to be extracted (`docs/style-guides/react-hooks.md` § Purpose of Custom Hooks).
- **A plain function handler is the default inside a component.** `useCallback` and `useMemo`
  belong on what a _hook_ returns (`docs/style-guides/react-hooks.md` § Memoise What a Hook
  Returns), and inside a component only with a measured reason.

---

## Accessibility

- **An icon-only button has an `aria-label`.** `<Button size="icon" aria-label="Stop api">`.
- **Clickable things are buttons or links.** A `<div onClick>` can't be reached by keyboard or
  announced by a screen reader. Navigation is a React Router `<Link>`; an action is a `<Button>`.
- **Decoration that repeats a label is hidden from screen readers**: `StatusDot` is
  `aria-hidden="true"` because the text beside it says `on` or `off`. A state shown only by colour
  needs words beside it.
- **Form inputs go through the form components** (`docs/style-guides/react-forms.md`), which wire
  labels and error messages to the input.
- **A question before a destructive action is an `AlertDialog`**
  (`npx shadcn@4.23.0 add alert-dialog`), not `window.confirm()`: removing a worktree, stopping a
  run.
