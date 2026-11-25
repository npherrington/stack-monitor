# Tickets are GitHub Issues

**Status:** Accepted — 2026-11

## Context

The agent skills this repo ports (triage, filing a ticket, working one unattended, fixing a bug)
came from a repo that tracks work in Linear. stack-monitor is a public repo on GitHub, meant for
other developers to use and contribute to, and its PRs, CI and reviews already live there.

## Decision

**GitHub Issues, through the `gh` CLI.** Triage state is labels (`needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`) plus a type label, listed in `.github/labels.json`;
`docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` say how the skills use them. A
branch for an issue names its number, and the PR closes it.

## Alternatives rejected

- **Linear**: outside contributors can't see or file tickets, and the skills would depend on an MCP
  server each person signs in to.
- **GitHub Projects (v2) for status**: a board on top of labels is possible later; the skills only
  need labels and open/closed, which `gh issue` handles without the GraphQL API.

## Consequences

- No Triage status: an issue is in triage while it carries `needs-triage`. Labels are applied once
  from `.github/labels.json` with the loop in `docs/agents/triage-labels.md`.
- Issues are public. Nothing private from a user's own repos goes in one.
