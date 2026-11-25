---
name: skill-quality-review
description: >-
  Score a SKILL.md against a five-dimension quality rubric. Use when asked to
  review a skill.
---

# Skill Audit

Evaluate one or more `SKILL.md` files against a five-dimension rubric. Return structured scores, highlights, and improvement items.

## Failure handling

If the provided path does not exist or the file has no frontmatter `description` field, stop and ask the user to confirm the correct path before proceeding.

## Scope

Focus exclusively on **skill quality** — how well the skill guides an agent.

Do not check structural or frontmatter validation rules: name format, description length, unknown fields, folder naming, line count, or similar mechanical constraints.

## Rubric

Score each dimension 1 to 3.

### Trigger clarity

Evaluate **only** the frontmatter `description` field, against `writing-for-agents` § Context pointers: the description is always loaded, so it carries one trigger per distinct case the skill handles and nothing the body already says.

- **3** — One clause saying what the skill is, then one specific trigger per distinct case. An agent can unambiguously decide when to activate.
- **2** — Reasonable triggers but overlaps another skill, misses a distinct case, or spends words on synonyms of one case or on identity the body carries.
- **1** — Vague or overly broad. Could match too many situations.

A trigger-clarity improvement does one of: add a missing case, collapse synonyms into one, cut identity the body carries, or draw a boundary against an overlapping skill.

**Exception: user-invokable-only skills.** If the frontmatter has `disable-model-invocation: true`, the agent never auto-triggers the skill from its description — only the user invokes it explicitly. Trigger clarity is irrelevant in that case: assign **3** automatically and state in the justification that the score is granted because the skill is user-invokable only (`disable-model-invocation: true`), so trigger phrasing has no effect on agent behavior. Do not raise trigger-clarity improvement items for these skills.

### Actionability

Evaluate the full file.

- **3** — Concrete steps, formats, commands, or decision rules throughout. An agent can execute without asking clarifying questions.
- **2** — Mostly specific but has gaps where the agent would need to improvise.
- **1** — Vague guidance like "handle appropriately" or "use best judgment."

### Scope discipline

Evaluate the full file.

- **3** — Tight, focused purpose with clear boundaries. Does one coherent thing.
- **2** — Mostly focused but drifts into adjacent concerns or has unclear boundaries.
- **1** — Tries to cover too much, mixes unrelated concerns, or is too vague about what it actually does.

### Failure handling

Evaluate the full file.

- **3** — Explicit recovery paths, escalation rules, or stop-and-ask conditions. A concise stop-and-ask rule is sufficient when appropriate.
- **2** — Some error handling but missing coverage for likely failure modes.
- **1** — Only covers the happy path.

### Conciseness

Evaluate the full file.

- **3** — No filler, no boilerplate explanations of how tools work, no restating obvious behavior. Every line teaches the agent something it would not do by default.
- **2** — Mostly lean but has some padding or redundant content.
- **1** — Significant padding or content an agent already knows.

## Scoring

The total score is the sum of all dimensions (out of 15), presented as a percentage.

## Highlights

When a skill does something notably well, call it out explicitly.

If there is nothing notable, return `None`.

## Improvement items

Include actionable improvement items only when there are concrete changes the author can make. Each item: dimension name + concrete edit + why it improves agent behavior.

Avoid vague advice like "be clearer" or "add more detail."

If a skill scores below 15/15, include at least one improvement item. If a skill scores 15/15 and there are no meaningful improvements, omit improvement items.

Prioritize items that would most improve agent behavior, not cosmetic edits.

## Output contract

For each evaluated skill, return:

1. **Dimension scores** — each dimension with its numeric score (1–3) and a one-sentence justification.
2. **Total** — sum and percentage.
3. **Highlights** — list of notable strengths, or `None`.
4. **Improvement items** — list following the structure above, or omitted if 15/15 with nothing meaningful to add.

When the caller provides previous scores (for re-review), also return deltas for any dimensions whose scores changed.
