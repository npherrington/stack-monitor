#!/usr/bin/env bash
# PreToolUse hook (Bash). Blocks a `git commit` or `gh pr create|edit|comment`
# whose text carries Claude's attribution: the `Co-Authored-By: Claude ...
# <noreply@anthropic.com>` trailer or the "Generated with [Claude Code](https://claude..."
# footer. The `commit-message` and `pull-request` skills forbid both. Looks in the
# command text, which holds -m, --body and heredocs, and in any -F / --file /
# --body-file file it can read. Exit 2 blocks the call and hands stderr back to Claude.

set -euo pipefail

input="$(cat)"

# Most Bash calls are neither command: pass them without starting node.
case "$input" in
  *commit*|*gh\ *pr\ *) ;;
  *) exit 0 ;;
esac

command -v node >/dev/null 2>&1 || exit 0
parsed="$(printf '%s' "$input" | node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write((p.cwd??"")+"\n"+(p.tool_input?.command??""))')"
cwd="${parsed%%$'\n'*}"
cwd="${cwd:-$PWD}"
cmd="${parsed#*$'\n'}"

marks='co-authored-by:[[:space:]]*claude[^<]*<noreply@anthropic\.com>|generated with \[claude code\]\(https://claude\.'

# After a `cd`, a relative path no longer resolves against the payload's cwd.
has_cd=""
if grep -Eq '(^|[;&|(`[:space:]])cd([[:space:]]|$)' <<<"$cmd"; then has_cd=1; fi

# carries <long flag>: the command text, or a file it names with -F or
# --<long flag>, carries one of the marks, in any case.
carries() {
  local flag="$1" f
  if grep -Eiq -- "$marks" <<<"$cmd"; then return 0; fi
  while IFS= read -r f; do
    case "$f" in
      -|'') continue ;;
      \~/*) f="$HOME/${f#\~/}" ;;
      /*) ;;
      *) [ -n "$has_cd" ] && continue; f="$cwd/$f" ;;
    esac
    if [ -r "$f" ] && grep -Eiq -- "$marks" "$f"; then return 0; fi
  done < <(grep -Eo -- "(^|[[:space:]])(-F|--$flag)(=|[[:space:]]+)[^[:space:];&|)]+" <<<"$cmd" |
    sed -E "s/^[[:space:]]*(-F|--$flag)(=|[[:space:]]+)//; s/^[\"']//; s/[\"']\$//" || true)
  return 1
}

block() {
  echo "Blocked by .claude/hooks/no-attribution.sh: the $1 carries a Claude attribution line (a 'Co-Authored-By: Claude' trailer or the 'Generated with [Claude Code]' footer), which this repo's $2 skill forbids, whatever the default attribution instruction says. Drop it and run the command again." >&2
  exit 2
}

is_commit='(^|[^[:alnum:]_.-])git([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|-[^[:space:]]+))*[[:space:]]+commit([[:space:]]|$)'
is_pr_body='(^|[^[:alnum:]_.-])gh([[:space:]]+(-R|--repo)(=|[[:space:]]+)[^[:space:]]+)?[[:space:]]+pr[[:space:]]+(create|edit|comment)([[:space:]]|$)'

if grep -Eq -- "$is_commit" <<<"$cmd" && carries file; then block "commit message" commit-message; fi
if grep -Eq -- "$is_pr_body" <<<"$cmd" && carries body-file; then block "PR body" pull-request; fi

exit 0
