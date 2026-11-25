# Server state goes through TanStack Query, over plain fetch

**Status:** Accepted — 2026-11

## Context

Nearly everything the page shows is server state that changes without the page doing anything: a
service comes up, a run writes another log line, a branch gets a commit. The server reads the
machine on every request and keeps nothing (PLAN.md § Principles), so the page decides how often to
ask. Actions (start, stop, create, remove, run) answer an `ActionResult` and change what other
queries return. The scaffold fetched in a `useEffect` with a hand-rolled "still mounted" flag.

## Decision

- **TanStack Query** for every read and every action: a `use<Thing>` hook in `web/hooks/` runs
  `useQuery` or `useMutation`, and components never call `fetch`. One `QueryClient` in
  `web/app.tsx`. Mutations don't retry.
- **Polling is `refetchInterval`**, and stops or slows when the data says nothing is changing (no
  run going, every service settled).
- **Plain `fetch`** in `web/lib/api.ts`, which turns "the monitor isn't there" and non-2xx answers
  into errors with readable messages. The server and page share their types through
  `core/types.ts`, so there's no generated client.
- How hooks, keys, polling and mutations are written is `docs/style-guides/react-data-fetching.md`.

## Alternatives rejected

- **`useEffect` + `useState` per fetch** (the scaffold's): every component re-solves loading,
  errors, races, refetch on focus, polling and invalidation after an action.
- **SWR**: smaller, and fine for reads, but mutations and invalidation are thinner, and the
  guides this repo ports are written for TanStack Query.
- **axios**: what it adds over `fetch` (interceptors, token refresh) matters for an authenticated
  remote API. This one is same-origin, on localhost, with no auth.
- **A generated client (OpenAPI)**: the server and page are one TypeScript project already sharing
  `core/types.ts`. A schema and a generator would describe what the type checker already checks.
- **Server push (SSE or WebSocket)**: the server keeps no state to push from, and each read
  re-runs `git` and `ps` anyway. Run logs may want a stream later; that would be its own decision.

## Consequences

- Every poll is a real read of the machine, so intervals are a cost: a tab polling every second
  runs `lsof` every second. Hooks poll only while something can change.
- Query keys are the cache's identity; an action invalidates the keys it changes, and a key
  mistake shows as a stale page, not an error.
- The page can import only Node-free code from `core/` (see `page-vite-react.md`).
