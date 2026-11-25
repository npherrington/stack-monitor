# Agents are the CLIs a developer already uses; the monitor holds no keys

**Status:** Accepted — 2026-11

## Context

The monitor starts headless agent runs in a checkout, drafts skills, sharpens prompts and runs
workflows of up to four steps. The original monitor ran Claude Code only, on its author's login.
Developers here use different agents (Claude Code, OpenCode, Codex, Cursor's agent), some pay
through a subscription and some through their own API keys, and some want local models (Ollama).
The monitor is a local server in a public repo, so whatever it stores is a target.

## Decision

- **An agent is a CLI behind an adapter** (`core/agents/adapter.ts`): how to run it headless,
  how to read its streamed output as common events (text, a tool call, the report, cost), and how
  to resume a session. Claude Code and OpenCode are the first two; each adapter declares what
  its CLI can do, and the page shows only that.
- **The monitor stores no API key.** Each CLI keeps its own login. A developer who wants their
  own provider key uses OpenCode, which takes keys for many providers (`opencode auth login`);
  Ollama's local models are reached the same way, as `ollama/<model>`.
- **The designer** (drafts skills, sharpens prompts) defaults to a free OpenCode model when
  OpenCode is installed, so the agentic tab works without spending anything; Settings → Agents
  can point it at any agent and model, an Ollama one included.
- **Permissions are three levels** a run picks: read, edit, full. Each adapter maps them onto its
  CLI (Claude Code's permission modes; OpenCode's config, which also keeps read and edit runs
  inside their checkout).
- **Runs start only from the page**, never from the MCP server: they spend money.

## Alternatives rejected

- **Calling model APIs from the monitor with keys stored in its settings**: the monitor would
  re-implement tools, file edits and permissions each agent already has, and would hold secrets
  on a local server whose page renders agents' output.
- **Keys in the macOS Keychain, handed to CLIs as environment variables**: possible later if a
  CLI needs it, but every CLI here already has its own login, so it buys nothing now.
- **One agent only (Claude Code)**: the tool is for developers on any agent.

## Consequences

- A new agent is one adapter and its tests; its headless flags and output format must be checked
  against the installed version, since they change between releases.
- The monitor can't tell whether Claude Code is logged in without starting a session; the page
  shows the login command instead.
- Free OpenCode models change and are rate-limited, and their prompts go to OpenCode's hosted
  provider; Ollama keeps a designer run on the machine.
