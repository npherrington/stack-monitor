---
name: frontend-security-coder
description: Secure coding for the page in `web/` and the server that serves it. Covers rendering untrusted agent and repo output (markdown reports, run logs, branch names, config values) without XSS, keeping the strict CSP in `server/static.ts`, safe links, and the Host, Origin and Content-Type checks in `server/http.ts`. Use when writing or reviewing code that renders agent or repo output, adds a markdown renderer, a link out or a route, or changes the CSP or response headers.
---

# Frontend Security Coder

Writes and reviews the page and its server so that what an agent or a repo puts in front of the
user can't act for them. This skill fixes code; it doesn't audit posture.

## The threat model

There's no sign-in: the monitor is local only (PLAN.md § Principles), and the server's checks stand
in for auth. What it defends against:

- **Untrusted content.** Agent reports and run logs are written by a model that read whatever was
  in the repo, so a prompt-injected agent can put anything in them. Branch names, commit messages,
  file paths and a committed `stack-monitor.json` come from whoever wrote the repo. All of it is
  untrusted.
- **Every other page open in the browser.** Any site can send requests to `127.0.0.1`.

The stakes are high because the page _acts_: it starts and stops services, removes worktrees, and
starts agent runs that spend money. Script injected into the page, or a request another site
manages to land, is remote control of the user's machine.

For every value rendered or acted on, ask: **who authored it, and where is it going?** Untrusted
data reaching an HTML, URL, CSS or command sink is the bug.

## Checklist

### Rendering untrusted output

- React text is the default: `{value}` escapes. Agent and repo content never goes through
  `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML` or `document.write`.
- **Markdown** (agent reports): render through a renderer that builds React elements and
  drops raw HTML, or render to HTML and sanitise it with DOMPurify on an allowlist. A renderer's own
  "safe" flag alone isn't enough. No renderer is in `package.json` yet: choosing one is a record in
  `docs/decisions/`.
- **Links in markdown**: `http:`, `https:` and `mailto:` only; anything else renders as text. File
  paths show as code, not as `file:` links.
- **Images in markdown**: the CSP's `img-src 'self' data:` already blocks a remote image, which
  would otherwise be a beacon reporting when the report was read. Keep it that way: show a remote
  image as its link.
- **Logs**: text only. ANSI escapes are stripped, or parsed into styled elements, never into an HTML
  string. A log can be huge: cap or window what's rendered, so one run can't freeze the tab.
- **Config values** (commands, paths, service names): shown as text, never interpolated into a URL,
  a `style` or a class name.

### The CSP

`PAGE_POLICY` in `server/static.ts` is sent with the page's HTML: script from the page's own files
only, nothing loaded from or sent to another origin, no plugins, no `<base>`, no form posts, no
framing. It's the second line behind sanitising, so keep it strict:

- No inline script, no `eval`, no `new Function`. A library that needs `'unsafe-eval'` or an inline
  `<script>` is out.
- `style-src` allows `'unsafe-inline'` for components that write inline styles; nothing beyond it.
- No CDN: everything is bundled by Vite, so there's no SRI to manage.
- Widening any directive is a record in `docs/decisions/` plus a change to `tests/static.test.ts`.

`mise run dev` builds the page and serves `dist/` through the monitor's server, so the policy holds
while you develop and a violation shows in the console straight away.

### The server's checks

`rejectReason` in `server/http.ts` runs before any route:

- **Host** must be `127.0.0.1:<port>` or `localhost:<port>`: that stops DNS rebinding.
- **Origin**, when sent, must be the page's own.
- **Anything but GET or HEAD** must be `application/json`, which no other site can send without a
  CORS preflight, and the server never answers one. Leave out every `Access-Control-Allow-*`
  header: their absence is the protection.
- **The body** is capped at `MAX_BODY_BYTES` (`server/routes.ts`).

What that leaves to you:

- **A GET only reads.** A link or an `<img>` on another site sends a GET with the right Host and no
  Origin, so anything that changes state is a POST.
- **Every route's input goes through `route()`** with a zod schema. A path, ref or name from the page
  is checked on the server as if the page didn't exist: inside the checkout, no `..`, a ref that
  can't start with `-` (`core/config/schema.ts` has `RepoPath` and `Ref`).
- **Request values reach a program as argv** through `run()` (`core/run.ts`, `execFile`), never
  spliced into a shell string. The shell runs only commands the repo's config declares.
- **The server listens on `127.0.0.1` only.**
- An absolute path in an error goes to the log, not into the answer (`server/static.ts`).

Every response also carries `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff` and
`Cross-Origin-Resource-Policy: same-origin` (`serve()` in `server/http.ts`). Keep them on any new
response path.

### Links and navigation

- A link out opens with `target="_blank" rel="noopener noreferrer"`; `window.open` with
  `noopener`.
- The router reads routes from the hash. A run id or path taken from the URL is validated before
  use, and the server re-checks it anyway.
- Nothing redirects to a URL that came from content.

### Storage

There are no tokens or secrets on the page. `localStorage` holds per-browser preferences only (the
theme picker, PLAN.md step 8), and every read of it is parsed as untrusted.

## This repo's context

- `eslint.config.js` has no rule against raw HTML sinks, so read the code rather than trusting the
  linter.
- `tests/http.test.ts` covers the Host, Origin, Content-Type and size checks, and
  `tests/static.test.ts` the page policy and paths outside `dist/`. A change to either behaviour
  changes its test.

## Steps

1. Name what's rendered or acted on, who authored it, and the sink it reaches.
2. Apply the checklist above to that path, client and server both.
3. Verify: the payloads and greps in the playbook's § Verification, and `mise run check`.

For code, open [resources/implementation-playbook.md](resources/implementation-playbook.md).
