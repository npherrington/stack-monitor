# The page is a Vite + React app; only the page is built

**Status:** Accepted — 2026-11

## Context

The monitor is a page people keep open all day, a server that reads the machine, and an MCP
server agents call. The page is interactive: checkouts with their git state, service chips that
start and stop, run logs that grow, forms to create worktrees and schedules, and a canvas for the
feature map. The original monitor this repo generalises already runs on Vite and React, so its
components come across with each module. The server half runs `.ts` directly through Node's type
stripping (PLAN.md § Principles), and the page will be loaded by an Electron window from
`http://127.0.0.1:<port>` (PLAN.md step 7).

## Decision

- **React 19 with Vite 8**, built into `dist/` by `mise run build` and served by the monitor's own
  `node:http` server (`server/static.ts`). No dev server proxy: `mise run dev` builds, then serves.
- **The page is the only thing built.** `core/`, `server/` and `mcp/` stay unbuilt `.ts`. The page
  imports shared types from `core/types.ts`, which imports nothing from Node, and
  `tsconfig.web.json` and the `build` task's sources list exactly the core files it imports.
- **`base: './'`**, so the built page loads its assets by relative path from wherever it's opened.
- **`@/` aliases `web/`** (`vite.config.ts`, `tsconfig.web.json`, and `tsconfig.json` for the
  shadcn CLI).

## Alternatives rejected

- **Next.js, Remix or another full-stack framework**: they bring a server of their own, and the
  monitor's server is the point of the tool: Host and Origin checks, the CSP, and routes that run
  `git`, `ps` and `lsof`. A framework server would sit beside it or replace it.
- **Server-rendered HTML from `node:http`**: the page is mostly live state that changes under it,
  and the feature map canvas is a client component either way.
- **Building the server too (tsc or esbuild to `dist/`)**: one more step between an edit and a
  running monitor, and source maps to read stack traces. Type stripping costs only the TypeScript
  features it can't erase (`erasableSyntaxOnly` is on).
- **Svelte, Solid or Vue**: the original's components are React, and so are the agents' and
  contributors' defaults.

## Consequences

- A page change needs `mise run build` (or `mise run dev`) to show. The `build` task skips when
  its sources haven't changed.
- The page can't import anything from `core/` that touches Node. A type the page needs goes in
  `core/types.ts`.
- The server's CSP (`script-src 'self'`) means no inline script in `index.html`, and nothing
  loaded from a CDN: fonts, icons and styles are bundled.
