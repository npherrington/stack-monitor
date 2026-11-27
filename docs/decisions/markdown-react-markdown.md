# Other people's markdown renders through react-markdown

**Status:** Accepted — 2026-11

## Context

The GitHub tab shows PR descriptions and review comments, which are GitHub-flavoured markdown
written by anyone who can open a PR: untrusted content on a page that can start services and agent
runs (`.claude/skills/frontend-security-coder/SKILL.md`). Shown as plain text, tables, code blocks,
task lists and suggestion blocks are hard to read. The page had no markdown renderer.

## Decision

**`react-markdown` with `remark-gfm`**, wrapped in one component, `web/components/github/markdown.tsx`.

- It parses to an AST and builds React elements, so text is escaped by React and raw HTML in the
  source is dropped, not rendered. There is no `dangerouslySetInnerHTML` and no separate sanitiser.
- Links render only for `http:`, `https:` and `mailto:`, opening in a new tab with
  `noopener noreferrer`; anything else renders as its text.
- Images render as a link: the CSP's `img-src 'self' data:` blocks remote images, which would tell
  their host when the PR was read, and stays as it is.
- Headings are stepped down so a description can't outrank the page's own heading.

## Alternatives rejected

- **Plain text**: no dependency, but PR descriptions lean on tables, lists and fenced code.
- **`marked` or `markdown-it` to HTML, then DOMPurify**: two dependencies, and the output goes
  through `dangerouslySetInnerHTML`, where a sanitiser misconfiguration is an XSS.
- **GitHub's own `bodyHTML`**: already rendered, but it's HTML from a third party injected into the
  page, with GitHub's image proxy URLs that the CSP blocks anyway.
- **`rehype-raw` for HTML in comments**: brings back the injection surface this choice avoids.

## Consequences

- `react-markdown` and `remark-gfm` (and the unified/mdast packages under them) are page
  dependencies; the page's bundle grows by them.
- HTML that people write in comments (`<details>`, `<sub>`) shows as nothing; the link to the
  comment on github.com is there for those.
- Agent reports, when they render as markdown, should go through the same component.
