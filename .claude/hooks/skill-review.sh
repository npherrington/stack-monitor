#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|MultiEdit|Bash). When a skill's SKILL.md or a CLAUDE.md
# is about to be created or edited (for Bash: a command that writes one, as
# skill-review-target.mjs decides), injects a reminder to load `writing-for-agents`
# first; for a skill, also to run `skill-quality-review` on it once the changes are
# done. Fires once per file per session.

set -euo pipefail

input="$(cat)"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# node, not jq, parses the payload; without it the hook stays quiet.
command -v node >/dev/null 2>&1 || exit 0
path="$(printf '%s' "$input" | node "$here/skill-review-target.mjs")"
[ -n "$path" ] || exit 0
case "$path" in /*) ;; *) path="${CLAUDE_PROJECT_DIR:-$PWD}/$path" ;; esac
session="$(printf '%s' "$input" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(p.session_id??"nosess").replace(/[^A-Za-z0-9-]/g,""))')"

case "$path" in
  */.agents/skills/*/SKILL.md|*/.claude/skills/*/SKILL.md)
    skill="$(basename "$(dirname "$path")")"
    key="$skill"
    ;;
  */CLAUDE.md)
    skill=""
    key="claude-md-$(printf '%s' "$path" | cksum | cut -d' ' -f1)"
    ;;
  *) exit 0 ;;
esac

marker_dir="${TMPDIR:-/tmp}/stack-monitor-skill-review-hook"
mkdir -p "$marker_dir"
marker="$marker_dir/${session}-${key}"
[ -f "$marker" ] && exit 0
: > "$marker"

load="Load the \`writing-for-agents\` skill now if it isn't loaded, and apply it to this edit and any further ones."
if [ -z "$skill" ]; then
  msg="🧪 Editing a CLAUDE.md. ${load} (Fires once per file per session.)"
elif [ -e "$path" ]; then
  msg="🧪 Editing the \`${skill}\` skill. ${load} When you've finished changing it, run the \`skill-quality-review\` skill on it and report the scores and improvement items. (Fires once per skill per session.)"
else
  msg="🧪 Creating a new skill, \`${skill}\`. ${load} Once SKILL.md is written, run the \`skill-quality-review\` skill on it and report the scores and improvement items before moving on."
fi

node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:process.argv[1]}}))' "$msg"
