# React Providers

Applies to: context providers in `web/`, and the provider tree in `web/app.tsx`.

A provider holds state that many components far apart in the tree need, and hands it out through
a context. Each one is three pieces: the context and its accessor hook, the provider component, and
(when the state is more than a few lines) a `use<Name>ProviderState` hook that builds the value.

```
contexts/<name>-context.ts       →  providers/<name>-provider.tsx  →  use<Name>()
(createContext + accessor hook)     (state, effects, memoised value)  (what components call)
```

The page has no provider of its own yet, only the library ones in `web/app.tsx`. The first one
creates `web/contexts/` and `web/providers/` and becomes the example for the sections below; the
snippets use the theme picker PLAN.md step 8 brings.

---

## What Belongs in a Provider

Context is for state that is **app-wide, read in many distant places, and changes rarely**.

| State                                                      | Lives in                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| Theme, and device preferences read on most pages           | a provider                                                      |
| Anything the server answers (checkouts, services, runs)    | TanStack Query, through a `use<Thing>` hook                     |
| State one page or one subtree needs                        | `useState` in the nearest common parent, passed as props        |
| A value that changes on every keystroke or animation frame | local state: a context re-renders every consumer on each change |
| The functions that call the server                         | `web/lib/api.ts`, imported by the hooks that call them          |

Server data in a context is a cache you maintain by hand: it goes stale, it isn't refetched on
focus or on an interval, and every action has to remember to update it. TanStack Query already
does all of that, and here every read is a fresh look at the machine, so a copy goes stale fast.

The fetch functions need no provider either: the page talks to its own origin with no session,
token or base URL to hand down, so a hook imports them (`docs/style-guides/react-data-fetching.md`
§ The Fetch Layer).

---

## The Context File

`contexts/<name>-context.ts` creates the context and exports the accessor hook. The context's
default is `undefined`, and the hook throws when it finds no provider:

```ts
export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(
  undefined,
)

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
```

- **Type the value as a named interface**, `<Name>ContextValue`, exported so tests can build one.
- **Components call the accessor, not `useContext`.** The accessor is the one place that knows the
  context exists and fails loudly when the provider is missing.
- **The context and the provider are separate files.** A component file exports only components
  (`docs/style-guides/react-components.md` § Files and Exports), so a file exporting both
  `ThemeProvider` and `useTheme` reloads the page on every save.

**Exception: a context with a safe static default.** When the default is correct for every
consumer with no provider state behind it, and something renders outside the provider on purpose
(an isolated test), give the context that default and don't throw: a theme context whose default
is `'system'` with a `setTheme` that does nothing. Say why in a comment on the `createContext`
call. A default that stands in for state only the provider can know (which checkout an area is
about) is a missing provider that fails quietly; keep the throw.

---

## The Provider Component

`providers/<name>-provider.tsx` exports one component that takes `children`, builds the value and
renders the context:

```tsx
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme())

  const setTheme = useCallback((next: Theme) => {
    storeTheme(next)
    setThemeState(next)
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
```

- **Memoise the value.** Every component that reads a context re-renders when the value's
  identity changes. An object literal in `value={{ ... }}` is a new identity on every render of the
  provider, so every consumer re-renders whenever anything above the provider does. Wrap the value
  in `useMemo` and every function in it in `useCallback`.
- **Expose actions, not raw setters.** `setTheme(next)` keeps storage and state in step in one
  place; handing out `setThemeState` lets a caller update one and forget the other.
- **A large value moves into a hook.** When the provider builds more than a handful of functions,
  put the state and functions in `providers/use-<name>-provider-state.ts` and keep the component to
  three lines.

---

## State That Outlives a Reload

The theme, "chosen in the header and remembered per browser" (PLAN.md step 8), is the case these
rules are for.

- **Read storage in the `useState` initializer**, `useState(() => readStoredTheme())`, not in a
  mount effect. An effect runs after the first paint, so the page renders once in the wrong theme
  and then flips.
- **Storage access goes through small functions in `web/lib/`** (`readStoredTheme`,
  `storeTheme`) that own the key names and the `JSON.parse`. A parse of a corrupted value throws
  during render; the reader catches it and returns the default.
- **Pick the store for the lifetime you want.** `localStorage` for what should outlive the tab:
  device preferences. `sessionStorage` only for state that should die with the tab. What belongs
  to the repo or the machine (schedules, run logs) is the server's, never the browser's.
- **Sync across tabs with the `storage` event** when a change in one tab should show in the others
  (the theme). Remove the listener in the effect's cleanup.

---

## Mirroring State Outward

When something outside React needs to know about provider state (a class or attribute on
`<html>` for the theme, which `@custom-variant dark` in `web/index.css` will read once the picker
comes), set it from an effect in the provider, keyed on that state:

```tsx
useEffect(() => {
  document.documentElement.dataset.theme = theme
}, [theme])
```

One effect covers every path that changes the state: the stored value on load, the picker, and
another tab's change. Setting it at each call site misses whichever path you forgot.

---

## The Provider Tree

All app-wide providers mount once, in `web/app.tsx`, outermost first by dependency: a provider
sits inside every provider whose hook it calls.

```tsx
// web/app.tsx
const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: false } },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
```

- **The `QueryClient` is created once at module level**, as above. One created in a component body
  is a new, empty cache on every render of that component. Its defaults are
  `docs/style-guides/react-data-fetching.md` § Retries.
- **The theme provider goes outermost** when it comes, so everything inside it, an error
  fallback included, is themed.
- **The toast provider wraps the router**, inside `QueryClientProvider`, so a toast raised from
  any page or hook renders over every route (`docs/style-guides/react-toasts.md`).
- **A provider for one area of the page mounts in that area's layout route** (beside
  `layouts/app-shell.tsx`), not in `web/app.tsx`, so it exists only while that area is on screen.
