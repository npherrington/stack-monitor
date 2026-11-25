# React Data Fetching

Applies to: every request the page makes: `web/lib/api.ts`, and the hooks in `web/hooks/` that run
`useQuery` / `useMutation`.

```
core/types.ts     →  web/lib/api.ts      →  use<Thing> hook             →  component
(what each route     (fetch; failures as    (useQuery / useMutation,       (calls the hook,
 answers)             readable errors)       keys, polling, invalidation)   renders the result)
```

The component never sees TanStack Query or `fetch`. It calls a hook and renders what the hook
returns.

**This is the point of the layer:** components stay about rendering, and the request
infrastructure sits in reusable hooks that speak in the domain's terms (`checkouts`, `isStarting`,
`stop`). Changing how a request is cached, polled, retried or invalidated is a change to the hooks
rather than to every component.

---

## Queries and Mutations Live in a Hook

Put each `useQuery` and `useMutation` in a `use<Thing>` hook, and call that hook from the
component. The hook owns the query key, the interval, the invalidation and the error handling; the
component body stays about rendering.

```tsx
// GOOD: the page asks for the checkouts and renders them
const { checkouts, isPending, error } = useCheckouts()

// BAD: TanStack and fetch wiring in the component body
const { data } = useQuery({
  queryKey: ['config-status'],
  queryFn: () => fetch('/api/config').then((response) => response.json()),
})
```

| Hook                                                | Holds                                                   |
| --------------------------------------------------- | ------------------------------------------------------- |
| `use<Things>()` / `use<Thing>(id)`                  | A read, plus anything derived from it                   |
| `use<Thing>Polling(...)`                            | A read the machine changes on its own, and when to stop |
| `use<Thing>Mutations()` / `use<Action>Mutation(id)` | One or more actions, and what each invalidates          |

- **Return named values, not the whole query or mutation object**:
  `{ checkouts, isPending, error }`, `{ stop, isStopping }`. A mutation's `mutate` or
  `mutateAsync` is fine to return under the action's name when the component calls it
  (`start: start.mutateAsync`). What stays in the hook is the wiring: keys, intervals,
  invalidation. Convert a hook that returns `useQuery`'s result as it is when you next touch it.
- **Everything returned is reference-stable.** Wrap the returned object in `useMemo`, and any
  function the hook builds itself in `useCallback`. TanStack's own `mutate` is already stable and
  can be returned as is. Components put these in effect and `useCallback` dependency arrays, so a
  new reference each render re-runs their effects (`docs/style-guides/react-hooks.md` § Memoise
  What a Hook Returns).
- **Derive in the hook.** `isGoing` ("is the run still running") is computed once in the run's
  hook, not at each call site.
- **One hook per thing, used everywhere it's needed.** Every page that shows the config reads it
  through `useConfigStatus()`, so they share one cache entry, one key and one interval.

---

## The Fetch Layer

`web/lib/api.ts` is the only code that calls `fetch`. Hooks import its functions and call them in
`queryFn` and `mutationFn`: `queryFn: () => getJson<ConfigStatus>('/api/config')`
(`use-config-status.ts`). There's no provider in between: the page talks to its own origin, with
no session, token or base URL to hand down.

- **Paths are relative** (`/api/config`), never `http://127.0.0.1:7420/...`. The port is the
  server's (`STACK_MONITOR_PORT`), the Electron window loads the same origin, and the CSP in
  `server/static.ts` lets the page reach no other origin.
- **A body goes as JSON, under the cap.** The server answers 403 to a POST whose `Content-Type`
  isn't `application/json` or whose `Origin` isn't the page's, and 400 to a body over
  `MAX_BODY_BYTES` (`server/http.ts`, `server/routes.ts`). A `fetch` from the page with a relative
  path sends the right `Origin` by itself; the POST helper beside `getJson` sets the content type.
  No POST helper exists yet; the first action adds it and becomes the example.
- **Every failure throws an error a person can read.** "The monitor isn't answering. Start it with
  mise run dev." is what `getJson` throws when `fetch` itself fails. A non-2xx answer carries an `ActionResult` (every
  route answers JSON, a refusal included, `server/http.ts`), and its `message` is the server's
  copy for the person: throw that, in an `ApiError` (`web/lib/api.ts`) that also keeps the status and the
  `log`, and leave the status line to the console. Pages and toasts show the error's `message` as
  is (`docs/style-guides/react-toasts.md`).
- **A refusal fails the call.** An action answers `ActionResult`, and `ok: false` is the server
  refusing, whatever the status. The action helper throws on it, once for every mutation, so
  `isError`, `onError` and a toast see a failure. A refusal returned as a value makes a refused
  Stop look done.
- **Return what the server sent.** If a page needs it sorted, grouped or renamed, change the route
  in `server/` (and its type in `core/types.ts`) first. Reshaping in the hook hides the mismatch
  and makes every caller pay for it.

```ts
// GOOD: the action helper in web/lib/api.ts turns a refusal into a failure
export async function postAction(
  path: string,
  body: unknown,
): Promise<ActionResult> {
  const result = await postJson<ActionResult>(path, body)
  if (!result.ok) throw new ApiError(200, result.message, result.log)
  return result
}

// BAD: the refusal comes back as a value; onSuccess runs and the page says it stopped
mutationFn: (service: string) =>
  postJson<ActionResult>('/api/stack/stop', { checkout, service }),
```

| Instead of                                     | Do                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Sorting in the hook or `api.ts`                | Have the route sort                                                                                      |
| Grouping for a page                            | Group in the hook's `select`, or answer groups from the route                                            |
| `fetch` in a hook or component                 | A function in `web/lib/api.ts`                                                                           |
| `response.json() as Checkout[]` at a call site | `getJson<Checkout[]>(...)`: the type parameter is the one cast, and it names a type from `core/types.ts` |
| Validating the answer with zod (`safeParse`)   | The shared type. The server and page type-check against the same file; zod in `web/` is for form input   |

---

## Types Come From `core/types.ts`

What each route answers is a type in `core/types.ts`, with a comment naming the route
(`ConfigStatus`, `// GET /api/config`). The route in `server/routes.ts` and the hook in `web/hooks/`
both import it, so a change to the answer is a type error on both sides.

- **A type the page needs goes in `core/types.ts`**, never hand-written in `web/`. The page
  imports only Node-free code from `core/`; `core/types.ts` imports nothing from Node for that
  reason, and `tsconfig.web.json` lists the `core/` files the page may import.
- **Narrow on the answer's own fields.** `ConfigStatus` is a union on `ok`;
  `config-summary.tsx` renders the modules when `status.ok` and the `problem` otherwise.

---

## Query Keys

A mutation finds the queries to refresh by key, so a key spelled two ways leaves a page stale.

- **The key is a constant in the query hook that owns it, exported for the mutations that refresh
  it**: `configStatusKey` in `use-config-status.ts`. A mutations hook imports it rather than
  spelling the key again.
- **The key holds every input the request depends on**: `['run', runId]`,
  `['stack', checkoutPath]`. A missing input serves one checkout's data for another.
- **Put the broad part first**, so invalidating `['stack']` refreshes every checkout's services
  after Stop all, and `['stack', checkoutPath]` refreshes one.

---

## Polling

No hook polls yet; the first one becomes the example.

Every read is a fresh look at the machine (`git`, `ps`, `lsof`, `docker ps`), and nothing pushes a
change to the page, so the page sees a service come up only by asking again.

| What it reads                                                 | Refreshes by                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Something that changes only when the user acts (the config)   | TanStack's refetch on focus, and the invalidation after its actions  |
| Machine state that changes on its own (services, runs, a log) | `refetchInterval`, short while something is changing, long otherwise |

Poll with `refetchInterval`, never a `setInterval` or a `setTimeout` loop. TanStack stops it when
the component unmounts, doesn't run two requests at once, and pauses while the tab is hidden; leave
`refetchIntervalInBackground` off, so a hidden tab runs no `lsof`.

**Poll on a status the server reads, and slow or stop when it says nothing is changing.** Each tick
runs real commands, so an interval is a cost. Pass a function that reads the status off the
answer:

```ts
// a run: every second while it runs, then not at all
refetchInterval: (query) =>
  query.state.data?.status === 'running' ? 1_000 : false,

// a checkout's services: quick while one is starting or stopping, slow once they've settled
refetchInterval: (query) =>
  query.state.data?.services.some((service) => service.settling)
    ? 1_000
    : 10_000,
```

**The page shows a failure only when the server reports one.** The server owns a service's and a
run's state: a start answers once the status reads up, a `ready` line shows in the log, or the
command fails. The page keeps no clock of its own on that work: no deadline, no elapsed-time check,
no copy of a server timeout.

```ts
// GOOD: exited is a status the run carries
const hasFailed = run.status === 'exited' && run.exitCode !== 0

// BAD: the page decides it failed from how long it has waited
const hasFailed = Date.now() - startedAt > RUN_TIMEOUT_MS
```

When nothing the server answers says whether the wait is over, add a status on the server before
writing the poll.

**The action that starts the work restarts the poll.** Its answer is an `ActionResult`, not the
record, so invalidate the key the poll reads: the next read shows the new status, and the interval
function picks it up from there.

**A polling query never raises a toast from its error.** It fails again on every tick. Show the
failure in the page and keep the last data, which TanStack holds through a failed refetch
(`docs/style-guides/react-toasts.md` § Toasts Answer Actions, Not Queries).

---

## Mutations

No mutation exists yet; the first one becomes the example.

A mutation is a user action: start, stop, create, remove, run. The hook wires what happens after
it.

```ts
const stop = useMutation({
  mutationFn: (service: string) =>
    postAction('/api/stack/stop', { checkout, service }),
  onSettled: () =>
    queryClient.invalidateQueries({ queryKey: stackKey(checkout) }),
})

// returned, memoised, as
// { stop: stop.mutateAsync, isStopping: stop.isPending }
```

- **Invalidate everything the action changed, in `onSettled`.** A refused or failed action can
  still have changed the machine (a start that failed partway left a container up), and the next
  read shows what's there. Creating a worktree changes the checkouts list and the free index
  numbers, so both keys are invalidated.
- **Report the outcome once**: a toast for success and failure
  (`docs/style-guides/react-toasts.md`).
- **Expose `isPending` under the action's name** (`isStopping`, `isRemoving`) so the button can
  disable itself and a second click can't start a service twice. In a react-hook-form submit,
  `await mutateAsync()` instead, so `isSubmitting` covers the request
  (`docs/style-guides/react-forms.md`).

---

## Retries

Retries are set once, on the `QueryClient` in `web/app.tsx`, and not per query to work around
them.

- **Mutations never retry** (`mutations: { retry: false }` in `web/app.tsx`). An action sent twice
  is a service started twice or a run, which spends money, started twice.
- **Queries skip what can't succeed on retry.** A refusal (4xx) answers the same the second time,
  and three retries with backoff hold "the monitor isn't answering" off the page for seconds. Retry
  a query at most once, and a 4xx not at all, reading the status the fetch layer keeps on the
  error.

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failures, error) =>
        failures < 1 && !(error instanceof ApiError && error.status < 500),
    },
    mutations: { retry: false },
  },
})
```
