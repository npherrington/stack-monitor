# Frontend security: implementation playbook

Code for the checklist in [`SKILL.md`](../SKILL.md). The page is React 19 in `web/`; the server is
`node:http` in `server/`.

## 1. Rendering untrusted text

React escapes text, so the safe version is the plain one:

```tsx
<p className="report-title">{run.title}</p> // whatever the agent wrote shows as text
```

The unsafe version is any HTML string built from it:

```tsx
<div dangerouslySetInnerHTML={{ __html: `<p>${run.title}</p>` }} /> // script runs on the page
```

`dangerouslySetInnerHTML` is for sanitised output (§ 2) or static, developer-written markup, with a
comment saying which.

## 2. Markdown from an agent

Two shapes, both fine; which renderer the page uses is a record in `docs/decisions/`.

**A renderer that builds React elements** and leaves raw HTML out of its output. Override its link
and image components so every URL goes through `safeHref` (§ 3), and render images as links.

**Markdown to an HTML string, then DOMPurify** on an allowlist:

```ts
import DOMPurify from 'dompurify'

const clean = DOMPurify.sanitize(html, {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'h2',
    'h3',
    'h4',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  ALLOWED_ATTR: ['href'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i, // no javascript:, data: or file:
})
```

`img` is left off the list on purpose: the CSP would block a remote one anyway.

Either way, add `target="_blank" rel="noopener noreferrer"` to the links after sanitising.

## 3. URLs from content

```ts
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

// The URL to link to, or null to show the text unlinked.
export function safeHref(raw: string): string | null {
  const url = URL.parse(raw)
  return url !== null && SAFE_PROTOCOLS.has(url.protocol) ? url.href : null
}
```

```tsx
const href = safeHref(link)
return href === null ? (
  <span>{text}</span>
) : (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {text}
  </a>
)
```

## 4. Run logs

Strip terminal escapes before rendering. OSC 8 hyperlinks matter here: a tool can print a link
whose text and target differ.

```ts
// CSI sequences (colours, cursor moves) and OSC sequences (titles, OSC 8 hyperlinks)
// eslint-disable-next-line no-control-regex -- matching escapes is the point
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g

export function plainLine(line: string): string {
  return line.replace(ANSI, '')
}
```

```tsx
const MAX_LINES = 2000 // the tail; the page offers the whole file another way

<pre className="log">
  {lines.slice(-MAX_LINES).map((line, i) => (
    <div key={i}>{plainLine(line)}</div>
  ))}
</pre>
```

Colour, if the page keeps it, comes from parsing the CSI codes into spans with class names, never
from an ANSI-to-HTML string.

## 5. A route that acts

A POST, through `route()` (`server/http.ts`), with the value checked against what the machine
reports rather than trusted because the page sent it. A sketch: the worktree routes land with
PLAN.md step 1.

```ts
'POST /api/worktrees/remove': route(
  z.object({ path: z.string().min(1) }),
  'a worktree path',
  async ({ path }) => {
    const known = (await listWorktrees(repo)).map((tree) => canonical(tree.path))
    if (!known.includes(canonical(path))) {
      return [400, failure(`${path} isn't a worktree of this clone`)]
    }
    // ...
  },
),
```

Values reach programs as argv, with `--` before one that could look like an option:

```ts
await run('git', ['-C', primary, 'branch', '-d', '--', branch]) // core/run.ts: execFile, no shell
```

Never this:

```ts
await run('/bin/sh', ['-c', `git branch -d ${branch}`]) // a branch named "x; rm -rf ~" runs
```

The shell runs only the commands a repo's config declares (`setup`, `start`, ...), and a request
never adds to them.

## 6. The CSP

`PAGE_POLICY` in `server/static.ts`:

| Directive                          | What it buys                                                |
| ---------------------------------- | ----------------------------------------------------------- |
| `default-src 'self'`               | no fetch, font or frame from another origin                 |
| `script-src 'self'`                | only the page's own files: no inline script, no `eval`      |
| `style-src 'self' 'unsafe-inline'` | inline styles for the components that write them            |
| `img-src 'self' data:`             | no remote image, so no beacon in an agent's report          |
| `object-src 'none'`                | no plugins                                                  |
| `base-uri 'none'`                  | an injected `<base>` can't move relative URLs elsewhere     |
| `form-action 'none'`               | no form posts anywhere; the page sends JSON through `fetch` |
| `frame-ancestors 'none'`           | no other page can frame it and steer clicks onto Stop       |

Trusted Types (`require-trusted-types-for 'script'`) would make a raw `innerHTML` assignment throw.
It isn't in the policy; adding it, like widening any directive, starts with a record in
`docs/decisions/` and ends with `tests/static.test.ts` asserting the new policy.

## 7. Verification

- **Payloads.** Put these in a fixture agent report, a run log and a branch name, and check each
  shows as text or is dropped, with no CSP violation in the console:
  - `<img src=x onerror=alert(1)>`
  - `"><script>alert(1)</script>`
  - `[click](javascript:alert(1))`
  - `![](https://example.com/beacon.png)`
  - a line with `\x1b]8;;https://example.com\x1b\\docs\x1b]8;;\x1b\\` in it
- **Sinks on the page:**

  ```sh
  rg -n 'dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|window\.open|target="_blank"' web/
  ```

- **The server:** every `'GET /api/…'` in `server/routes.ts` only reads, and
  `rg -n 'Access-Control' server/` finds nothing.
- **Against the running monitor** (`mise run dev`), both answer 403:

  ```sh
  curl -i -H 'Host: evil.example:7420' http://127.0.0.1:7420/api/health
  curl -i -X POST -H 'Origin: http://evil.example' -H 'Content-Type: application/json' \
    -d '{}' http://127.0.0.1:7420/api/health
  ```

- `npm audit` for dependencies with known CVEs. It doesn't find a sink in the page's own code; the
  grep does.
- `mise run check`.
