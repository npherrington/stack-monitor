---
name: commit-message
description: Stage and commit the working tree as one or more concise, human-sounding single-line commits, skipping unrelated or auto-regenerated noise. Use when asked to commit, write a commit message, or split changes into commits. If the working tree spans unrelated concerns, splits into multiple commits — one per concern — rather than bundling.
---

# Commit Message Writer

Inspect the full working tree (staged + unstaged + untracked), split it into
coherent commits by concern, and commit each one with a concise, human-sounding
message. Skip files that are noise (auto-regenerated, unrelated, or
pre-existing untracked work).

## Workflow

1. Survey the working tree:
   ```bash
   git status
   git diff
   git diff --staged
   ```
2. Sanity-check repo style with `git log --oneline -20` and match it
   (length, capitalization, any project-specific prefix conventions).
3. Group the changes by concern: the change a reviewer would name ("trim
   CLAUDE.md", "add the refund endpoint"). A multi-step change to one thing,
   including the fixes from its review, is one concern and one commit, not one
   per plan step or review round. Split only changes that are unrelated, e.g.
   a feature alongside a gitignore tweak or a tooling fix, or where the calling
   skill sets the split (e.g. one commit per bumped package).
4. Identify files to SKIP entirely (do not stage):
   - Auto-regenerated files (e.g. `*.tsbuildinfo`, Vite caches, generated
     lockfiles for unrelated package work). A regenerated
     `schema/stack-monitor.schema.json` that goes with a change to
     `core/config/schema.ts` is not noise: commit it with that change
   - Pre-existing untracked work that predates this session
   - Any file the user has specifically said to leave out
5. For each commit:
   1. Stage only the files for that commit with explicit `git add <file> ...`
      — never `git add -A` or `git add .`
   2. Write the message per the voice and formatting rules below
   3. Commit with a single-line `-m`; no body, and no `Co-Authored-By: Claude`
      trailer (the voice is "pragmatic engineer", not "AI assistant"):
      ```bash
      git commit -m "<message>"
      ```
6. After all commits, run `git status` to confirm only the intentionally
   skipped files remain.

## When to refuse / ask

- Pushing or opening a PR is `ship-it` / `pull-request`, not this skill.
- If the working tree is empty: report it and stop.
- If a change looks destructive or sensitive (deletion of a file the user
  may not have meant to delete, staged secrets, large binary blobs): pause
  and surface the concern before committing.
- If a "concern" is genuinely ambiguous (e.g. one file changes both an
  unrelated bug fix and the main feature in different hunks): ask the user
  rather than guessing — DO NOT use `git add -p` to silently re-slice
  without confirmation.
- Unattended (`docs/agents/unattended.md`): an ambiguous file goes in the
  commit of its dominant concern, noted in the PR body; a secret or an
  unintended deletion is still a stop.

## Voice

Sound like a pragmatic engineer, not an AI assistant.

Never use hype, marketing language, or explanations.

Avoid these words:

- enhance
- improve
- optimize
- robust
- comprehensive
- seamless
- sophisticated
- modernize
- refactorings
- leverage

Do not:

- narrate what you are doing
- mention "the user", "the developer", or "the system"
- explain obvious changes

Keep commits short and specific. Prefer concrete nouns and verbs. Use
lowercase except for proper nouns. No filler adjectives. No emojis. No
AI-style summaries.

## Good examples

- fix race condition in websocket reconnect
- add cache headers for avatar routes
- remove unused stripe webhook handler
- handle null session in auth middleware
- split billing settings into separate component
- use optimistic updates for message send
- rename workspace slug helpers
- prevent duplicate cron job execution

## Bad examples

- improve websocket reliability and robustness
- enhance authentication flow handling
- optimize component architecture
- implement comprehensive error handling
- refactor system for better maintainability

## Formatting

Every commit message is a single line, with no body:

- under 72 characters
- imperative mood ("add", not "added" or "adds")
- no trailing period

## Output

Return only the final commit message. No preamble like "Here's the message:".
No explanation. No follow-up. The text returned is what gets pasted into the
commit.
