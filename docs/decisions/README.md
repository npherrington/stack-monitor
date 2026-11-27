# Decisions

Why the architecture is the shape it is: which dependencies the tool rests on, and the structural
choices that would otherwise get re-argued. One file per choice. Read the relevant record before
taking on, replacing or arguing against a dependency or structure. `Alternatives rejected` usually
already answers it, and `Context` says whether the reason still holds.

The format is in `.agents/skills/domain-modeling/ADR-FORMAT.md`: a `Status` line, then Context,
Decision, Alternatives rejected and Consequences, in 40–80 lines. A record is written once and
amended only to change its `Status`. Reasoning that turns out wrong gets a new record that
supersedes the old one.

PLAN.md § Principles holds the rules the whole tool keeps (reads, doesn't remember; refuses what
it can't check; local only; no build step for the server). A record here is for one choice.

| Decision                                                       | Status             | Summary                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [agents-cli-adapters.md](agents-cli-adapters.md)               | Accepted — 2026-11 | An agent is a CLI behind an adapter (Claude Code, OpenCode first); the monitor stores no API key, OpenCode is the bring-your-own-key and Ollama path; the designer defaults to a free OpenCode model; runs take read, edit or full permissions and start only from the page |
| [board-sqlite.md](board-sqlite.md)                             | Accepted — 2026-11 | The ticket board is one SQLite file through Node's built-in `node:sqlite`, opened per call, versioned by `user_version`; always on, no config section; the first thing kept that a person wrote rather than the machine                                                     |
| [data-tanstack-query.md](data-tanstack-query.md)               | Accepted — 2026-11 | Every read and action goes through a TanStack Query hook over plain `fetch` in `web/lib/api.ts`; types shared through `core/types.ts`, no generated client, no axios; polling only while something can change                                                               |
| [desktop-electron.md](desktop-electron.md)                     | Accepted — 2026-11 | The Mac app is Electron 45 running the server in-process from `app/main.ts` (`mise run app`); one window locked to the monitor's origin; shipped as a notarized download, not through the App Store, whose sandbox rules out the monitor's job                              |
| [forms-react-hook-form-zod.md](forms-react-hook-form-zod.md)   | Accepted — 2026-11 | Forms are react-hook-form with a zod schema above the component, reusing a route's schema from `core/` where there is one                                                                                                                                                   |
| [markdown-react-markdown.md](markdown-react-markdown.md)       | Accepted — 2026-11 | PR descriptions and review comments render through react-markdown with remark-gfm: React elements, raw HTML dropped, safe link protocols only, remote images as links                                                                                                       |
| [page-vite-react.md](page-vite-react.md)                       | Accepted — 2026-11 | The page is React 19 on Vite, built into `dist/` and served by the monitor's own server; `core/`, `server/` and `mcp/` stay unbuilt `.ts`; `base: './'`, `@/` is `web/`                                                                                                     |
| [routing-hash-router.md](routing-hash-router.md)               | Accepted — 2026-11 | React Router's hash router, so the server serves only `/` and the assets and relative asset paths hold on every route                                                                                                                                                       |
| [tickets-github-issues.md](tickets-github-issues.md)           | Accepted — 2026-11 | Tickets are GitHub Issues through `gh`; triage state is labels from `.github/labels.json`                                                                                                                                                                                   |
| [ui-resizable-panels.md](ui-resizable-panels.md)               | Accepted — 2026-11 | The page and terminal panes split through react-resizable-panels v4 (shadcn `resizable`); our tree in `web/lib/pane-layout.ts` holds the layout, and the page and terminals are held elements moved between panes rather than remounted                                     |
| [ui-shadcn-base-ui-tailwind.md](ui-shadcn-base-ui-tailwind.md) | Accepted — 2026-11 | shadcn `base-lyra` on Base UI, copied into `web/components/ui/`; Tailwind v4 with the theme as tokens in `web/index.css`; dark mode follows the system until the theme picker; `cva`, `cn`, lucide                                                                          |
