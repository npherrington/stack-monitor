#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|MultiEdit). Looks at the file being edited,
# figures out which area of the repo it belongs to, and injects a one-time
# reminder pointing at that area's section in the `implement` skill (what to
# read first, and what reviews it). Fires once per area per session so it
# nudges on first contact and then stays quiet.
#
# Source of truth for the actual path->guide map is
# .claude/skills/implement/SKILL.md: this script only routes to a section, by
# the area name each section's heading starts with.

set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

input="$(cat)"

path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"
session="$(printf '%s' "$input" | jq -r '.session_id // "nosess"' | tr -cd 'A-Za-z0-9-')"

# Nothing to route on.
[ -z "$path" ] && exit 0
case "$path" in /*) ;; *) path="/$path" ;; esac

# Most specific first. area="" means "not a code area we route": emit nothing.
area=""
review=""
case "$path" in
  */node_modules/*|*/dist/*) ;;
  */web/components/*)
    area="web-components"; review="style-guide-check and frontend-security-coder" ;;
  */web/hooks/*)
    area="web-hooks"; review="style-guide-check and frontend-security-coder" ;;
  */web/providers/*|*/web/contexts/*|*/web/app.tsx|*/web/main.tsx)
    area="web-providers"; review="style-guide-check and frontend-security-coder" ;;
  */web/lib/*)
    area="web-lib"; review="style-guide-check and frontend-security-coder" ;;
  */web/*|*/index.html|*/vite.config.ts|*/components.json)
    area="web"; review="style-guide-check and frontend-security-coder" ;;
  */core/*) area="core" ;;
  */server/*) area="server" ;;
  */mcp/*) area="mcp" ;;
  */tests/*) area="tests" ;;
  */scripts/*) area="scripts" ;;
  */.github/workflows/*) area="workflows" ;;
  */.claude/hooks/*|*/.claude/settings.json) area="hooks" ;;
esac

[ -z "$area" ] && exit 0

# Once per area per session.
marker_dir="${TMPDIR:-/tmp}/stack-monitor-implement-hook"
mkdir -p "$marker_dir"
marker="$marker_dir/${session}-${area}"
[ -f "$marker" ] && exit 0
: > "$marker"

msg="📐 Editing ${area}. Before writing, read the \`${area}\` section of .claude/skills/implement/SKILL.md and everything it lists for this area."
case "$area" in
  core|server|mcp)
    msg="${msg} At review, \`skeptical-code-reviewer\` checks it against PLAN.md § Principles." ;;
  tests|scripts|workflows|hooks)
    msg="${msg} Its gate is the part of \`mise run check\` that section names." ;;
esac
if [ -n "$review" ]; then
  msg="${msg} At review, \`skeptical-code-reviewer\` runs ${review} on it."
fi
msg="${msg} (Fires once per area per session.)"

jq -n --arg ctx "$msg" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: $ctx
  }
}'
