# React Hooks

Applies to: `web/hooks/**`, and any custom hook defined elsewhere.

---

## Purpose of Custom Hooks

Hooks encapsulate complexity and keep components focused on rendering. Extract logic into a hook
when:

- State management becomes complex (multiple related states, validation)
- Side effects need coordination (polling, subscriptions, cleanup)
- Logic is reused across multiple components
- A component is doing too much beyond rendering UI

---

## Files and Naming

One hook per file in `web/hooks/`, the file named after the hook in kebab-case:
`use-config-status.ts` holds `useConfigStatus`. A hook's file holds the hook and the types and
constants only it uses, plus the query key its mutations import (`configStatusKey`), never a
component.

| Pattern                      | Use for                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| `use<Entity>`                | Context accessors (`useTheme`)                                   |
| `use<Things>` / `use<Thing>` | A query and what's derived from it (`useConfigStatus`)           |
| `use<Thing>Mutations`        | The actions on a thing (start and stop on a checkout's services) |
| `use<Thing>Polling`          | A read the machine changes on its own (a run's log)              |
| `use<Entity>State`           | Local state management                                           |
| `use<Feature>Flow`           | A feature's actions and what follows each                        |
| `use<OptionName>`            | A value shaped for another library's API                         |

---

## Hook Categories

### 1. Context Accessor Hooks

A wrapper around `useContext` that throws outside its provider. These live beside their context,
not in `web/hooks/` (`docs/style-guides/react-providers.md` § The Context File).

### 2. Input State Hooks

No input state hook exists yet; the first one becomes the example.

Forms use react-hook-form (`docs/style-guides/react-forms.md`). A hook earns its place for input
state that isn't a form, such as a search box over the checkouts:

```ts
export function useCheckoutFilter(): UseCheckoutFilterResult {
  const { checkouts: all, isPending, error } = useCheckouts()
  const [search, setSearch] = useState('')

  const checkouts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle === ''
      ? all
      : all.filter((checkout) => checkout.branch.toLowerCase().includes(needle))
  }, [all, search])

  return useMemo(
    () => ({ search, setSearch, checkouts, isPending, error }),
    [search, checkouts, isPending, error],
  )
}
```

### 3. Query/Data Hooks

The query, polling and mutation rules (keys, `refetchInterval`, what a hook may return) are in
`docs/style-guides/react-data-fetching.md`; this section shows the shape. `use-config-status.ts`
is the existing query hook: a key constant, and a `queryFn` that calls `getJson` with the type the
route answers.

Wrap TanStack Query with the domain's terms and derived state:

```ts
interface UseRunResult {
  run: Run | null
  isPending: boolean
  error: Error | null
  isGoing: boolean // derived
}

export function useRun(id: string): UseRunResult {
  const { data, isPending, error } = useQuery({
    queryKey: runKey(id),
    queryFn: () => getJson<Run>(`/api/runs/${encodeURIComponent(id)}`),
    // refetchInterval: react-data-fetching.md § Polling
  })

  const isGoing = data?.status === 'running'

  return useMemo(
    () => ({ run: data ?? null, isPending, error, isGoing }),
    [data, isPending, error, isGoing],
  )
}
```

### 4. Polling Hooks

Polling a route uses TanStack's `refetchInterval`, not a timer, per
`docs/style-guides/react-data-fetching.md` § Polling. Hand-roll a loop only for what TanStack
can't express, such as an interval that adapts between ticks, and then own every cleanup
(§ Clean Up Side Effects).

### 5. Flow/Orchestration Hooks

No flow hook exists yet; the first one becomes the example.

Compose other hooks to drive a multi-step workflow, and expose the steps as named actions. The
request itself comes from a mutation hook (`docs/style-guides/react-data-fetching.md` § Queries and
Mutations Live in a Hook); the flow hook adds what follows it:

```ts
// Starts a run in the worktree, then opens its log; a failure is one toast and stays put.
export function useRunFlow(): UseRunFlowResult {
  const { startRun, isStartingRun } = useRunMutations()
  const navigate = useNavigate()

  const start = useCallback(
    async (spec: RunSpec) => {
      try {
        const run = await startRun(spec)
        navigate(`/runs/${encodeURIComponent(run.id)}`)
      } catch (error) {
        toastFailure(error, "Couldn't start the run")
      }
    },
    [startRun, navigate],
  )

  return useMemo(
    () => ({ start, isStarting: isStartingRun }),
    [start, isStartingRun],
  )
}
```

**One flow hook per feature.** A feature's actions, and what follows each one (navigate, toast,
the answer that counts as done), live in one `use<Feature>Flow` hook, whichever screens call them.
Each screen takes the action it needs. A flow hook holds a workflow; it isn't a second entry point
to the same action, so a second button calling it doesn't get a hook of its own.

| GOOD                                                                              | BAD                                                                                 |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| one `useRunFlow` returning `start` and `startAndFollow`                           | a flow hook per button, each wrapping the same mutation with its own error handling |
| the mutation in the thing's `use<Thing>Mutations` hook, which the flow hook calls | the flow hook running its own `useMutation`                                         |

Where a feature's actions are split over several flow hooks, merge them when you next change one.

**State another page needs is read from the server.** Carrying it between pages in the query cache
(a mutation's variables or submit time read back with `useMutationState`) loses it on a reload or
in a second tab. The server reads it from the machine instead (a run's status from its run file, a
schedule from the clone's git dir), and every page gets the same answer
(`docs/style-guides/react-data-fetching.md` § Polling).

### 6. Composition Hooks

Build a higher-level hook from simpler ones, adding only the logic that's specific to it: a
checkout's row reads `useCheckouts()` for its git state and a service hook for its stack, and
returns the two together. The pieces keep their own keys and intervals.

---

## Patterns to Follow

### Define Typed Interfaces

Define interfaces for options and return values, named `Use<Hook>Options` and `Use<Hook>Result`,
as `UseRunResult` above.

### Derive, Don't Store

A value computed from other state is computed, not kept in its own `useState` and synced with an
effect. Plain computation is the default; wrap it in `useMemo` when it's expensive or when its
identity matters to a caller.

```ts
// GOOD
const isGoing = run?.status === 'running'

// BAD: a second source of truth, one render behind
const [isGoing, setIsGoing] = useState(false)
useEffect(() => setIsGoing(run?.status === 'running'), [run?.status])
```

What the server decides stays the server's: whether a worktree can be removed or a service
stopped comes on the record it answers (PLAN.md § Principles, "refuses what it can't check").
Derive display from it; don't re-derive the rule.

### Memoise What a Hook Returns

Memoise what a hook **returns**. Inside a component, memoise only with a measured reason. The two
rules meet at the module boundary.

A hook can't see its call sites. Anything it returns may end up in a caller's dependency array,
so an identity that changes every render silently re-runs their effect, and the bug surfaces in
their file, not the hook's. Reference stability is part of a hook's contract, the same way React
guarantees a `useState` setter is stable. Inside a component you can see every consumer, so the
default is a plain function.

```ts
// GOOD: the hook returns a toggle its callers may depend on
const toggleExpanded = useCallback(
  () => setExpanded((expanded) => !expanded),
  [],
)

// BAD: memoising a handler that never leaves the component
const handleClick = useCallback(() => setOpen(true), [])
```

Wrap a returned object in `useMemo` and a returned function in `useCallback`. Keep the
dependencies primitive where you can: destructure a value out of an options object rather than
depending on the object, which is a fresh literal on every render.

### Clean Up Side Effects

Every effect that starts something stops it in its cleanup: timers, listeners, subscriptions,
in-flight requests.

```ts
// another tab changed the theme
useEffect(() => {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) setThemeState(readStoredTheme())
  }
  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}, [])
```

### Inject What's Impure

Take browser APIs, clocks and other side-effecting dependencies as parameters with production
defaults, so a test can substitute deterministic values:

```ts
const windowMatchMedia: MatchMedia = (query) => window.matchMedia(query)

export function useMediaQuery(
  query: string,
  matchMedia: MatchMedia = windowMatchMedia,
): boolean {
  // ...
}
```

If a hook can't be tested because a dependency is hardwired (`matchMedia`, timers, `getJson`),
that's the signal to lift the dependency into a parameter, not to skip the test.

---

## Comments on Complex Hooks

Put a comment above a hook whose behaviour isn't obvious from its name and types: a multi-step
flow, a poll with a stop condition, anything with ordering constraints. Say what it does and when
it finishes, not how each line works. `use-config-status.ts` says why it has no interval: the
server reads the config on every request, so the refetch on focus shows an edit.

---

## Testing Hooks

No hook has a test yet; the first one becomes the example.

Test a hook through a small harness component that calls it and renders enough UI to drive and
assert on, rather than calling the hook in isolation. That exercises it the way the page does,
inside a real render with a real `QueryClientProvider`, and catches identity and effect-ordering
bugs that a bare call misses.
