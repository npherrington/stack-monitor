# Pages are routes in React Router's hash router

**Status:** Accepted — 2026-11

## Context

The page is growing from one card into several pages: Checkouts, Setup, Schedules, a run's log,
the feature map. Each wants a URL that survives a reload and that a link, a notification or an
agent's report can open. The built page is served by the monitor's own server, which serves files
from `dist/` and answers 404 for anything else (`server/static.ts`), and it's built with
`base: './'` so its assets load by relative path (see `page-vite-react.md`).

## Decision

**React Router, with `createHashRouter`** in `web/router.tsx`. A route lives after the `#`
(`/#/checkouts`), so the server only ever serves `/` and the assets, and relative asset paths keep
resolving whatever the route. Layouts render an `<Outlet />` (`web/components/layouts/`), pages
live in `web/components/pages/`.

## Alternatives rejected

- **`createBrowserRouter`** (clean paths): the server would need a fallback that answers
  `index.html` for every unknown path that isn't `/api` or a file, and the assets would need
  absolute paths, since `./assets/x.js` from `/checkouts/x` resolves under `/checkouts/`. Both are
  doable; neither buys anything a local tool's users see.
- **Views switched by state, no router**: no URL for a page, so no deep links from notifications,
  reports or the MCP server, and no back button.
- **TanStack Router**: typed routes are a real gain, but the ported guides and the original's app use React
  Router, and the page has a handful of routes.

## Consequences

- URLs carry a `#`. A link the server or an agent writes to a page is
  `http://127.0.0.1:<port>/#/<route>`.
- Moving to the browser router later is the server fallback, `base: '/'`, and a change in
  `web/router.tsx`; route definitions and links don't change.
