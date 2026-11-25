---
name: retro
description: 'Conduct a retrospective on a coding session.'
disable-model-invocation: true
---

The user has asked for a **retrospective**. You are suggesting improvements to the coding agent's **environment** to improve future runs.

## Steps

1. Call the Skill tool with `writing-for-agents` for the writing style guide.

2. Read the primary sources for the session the user specifies. If the user doesn't specify a session, default to the current one, which is already in your context: work from that and read a log only for another session. Session logs are `<session-id>.jsonl` files in a per-checkout folder under `~/.claude/projects/`, and each worktree has its own folder: find it with `ls -d ~/.claude/projects/*-<checkout dir name>`, then `ls -t` inside it for newest first. If you can't pin down which session the user means, list the 5 most recent with each one's first user message and ask. Also read the memory folder, which is shared across worktrees and lives only under the main checkout's folder: the main checkout is the first line of `git worktree list`, so it's `ls -d ~/.claude/projects/*-<its dir name>/memory`.

3. Look for candidates for improvement in these categories.

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
- **Automated checks**: are there automated checks that could catch errors the agent made? Linting, typing, tests, filesystem linters? Read the repo's own checks first: `CLAUDE.md` § When to Run Tests, `mise` tasks (`lint:backend`, `lint:app`), and any CI workflows under `.github/workflows/`. A check that already exists but sits unwired or silently broken is the finding, not a reinvention. No pre-commit hook runs here; CI is the guardrail, so proposing a pre-commit hook means adding a tool. _Use when_ the agent made a mistake an automated check could have caught.
- **Coding standards**: should the reviewers (`style-guide-check`, the `skeptical-code-reviewer` agent) be given a new rule to enforce? Should an existing rule be removed or clarified? Classify the violation first: a **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check, full stop: a custom lint rule, a CI job, or a `.claude/hooks/` hook when the mistake is the agent's rather than the code's, whichever is cheapest. Default to building the check over writing the rule. Reserve `docs/style-guides/` for genuine **judgement calls** (cross-file consistency, "matches the surrounding style," anything no guardrail could ever substitute for). _Use when_ a reviewer failed to catch a mistake.
- **CLAUDE.md**: are there steering instructions in the repo `CLAUDE.md` or the user's `~/.claude/CLAUDE.md` that belong somewhere narrower: a style guide, a skill, a doc behind a pointer, or a check? Name the specific section and where it goes. _Use when_ a section only bears on some tasks.
- **Feedback memories**: does a feedback memory keep recurring? One about code is a candidate for a style guide rule or a check. One about how the agent talks or works belongs in `~/.claude/CLAUDE.md` if it holds across projects, the repo `CLAUDE.md` if it is this repo's workflow, or the skill it concerns. _Use when_ the session repeated a correction a memory already records.
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is there any custom tooling (CLI's, MCP's) that is particularly token-inefficient? _Use when_ the agent made an expensive tool call.
- **No-ops**: look for instructions in steering files that don't modify the agent's behavior. _Use when_ the steering files are large and unwieldy.
- **Information access**: look for opportunities to increase the agent's access to information. Teeing dev server logs, readonly access to third-party services. _Use when_ a crucial piece of information was not available to the agent.

4. Present these candidates to the user, in order of severity. Each one gives its category, the evidence from the session (what the agent did and what it cost), the proposed change, and the file it lands in. The evidence stays in the report: proposed guide or doc text is forward-facing, per `docs/style-guides/README.md` § Writing a guide. If nothing qualifies, say so and stop.

## Reference

### Implementation vs Review

All work goes through two stages: implementation and review. The implementation agent has the most **context pressure**: it explores, writes code, and debugs failures. The review agent has the least: it receives a diff, so it needs no exploration.

In this repo the implementation agent still reads every style guide for its area before editing (`CLAUDE.md` step 3, the `implement` skill, its edit-time hook), and review enforces them again. That is deliberate. Target what a guide says, not when it is read; the review stage is where a missed rule should get caught.

### Files

- `CLAUDE.md`: loaded into every agent's context in this repo. Keep it to what every session needs, and push the rest behind a pointer.
- `docs/style-guides/`: how to write code here, one guide per area. Add a rule to the matching guide before proposing a new one; a rule change or a new guide is its own PR (`CLAUDE.md` § Style Guides). A new guide follows `docs/style-guides/README.md` § Writing a guide, which also lists where it gets registered.
- `docs/decisions/`: why a provider or structure was chosen. Read the relevant one before proposing a dependency change, and propose a new record alongside any new external service (including read-only access to one).
- Docs: use docs as reference files, pointed to by other files. Look for existing docs before writing new ones.
- Skills: use skills for docs (since their description goes into the agent's context window), or for user-invoked commands. Follow the advice in the `writing-for-agents` skill.
