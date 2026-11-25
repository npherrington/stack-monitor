#!/usr/bin/env node
/**
 * skill-review-target.mjs — read a PreToolUse payload on stdin and print the SKILL.md or
 * CLAUDE.md path the call is about to write, or nothing. Used by skill-review.sh.
 *
 * Edit/Write: `tool_input.file_path`. Bash: a path only counts when the command writes to it —
 * a redirect or `tee` target, the file of an in-place `sed`/`perl`/`ruby`, the last argument of
 * `cp`/`mv`, or a quoted path in a command that calls a file-write API (python's `open(..., "w")`
 * with the path in a variable, `writeFileSync`, `write_text`). Reading one (`cat`, `grep`,
 * `2>/dev/null` on the same line, `cp` from it) prints nothing.
 */
import { readFileSync } from 'node:fs'

const payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
const filePath = payload.tool_input?.file_path
const command = payload.tool_input?.command

const path = String.raw`[A-Za-z0-9_.\/-]*(?:SKILL|CLAUDE)\.md`

function bashTarget(text) {
  const cleaned = text
    .replace(/&?\d*>>?&\d*/g, ' ')
    .replace(/&?\d*>>?\s*\/dev\/null/g, ' ')
  const patterns = [
    new RegExp(String.raw`>>?\s*["']?(${path})`),
    new RegExp(String.raw`\btee(?:\s+-a)?\s+["']?(${path})`),
    new RegExp(
      String.raw`\b(?:sed|perl|ruby)\b[^|;&\n]*?(?:\s-[a-zA-Z0-9]*i\b|\s--in-place\b)[^|;&\n]*?(${path})`,
    ),
    new RegExp(String.raw`\bawk\s+-i\s+inplace\b[^|;&\n]*?(${path})`),
  ]
  for (const pattern of patterns) {
    const match = cleaned.match(pattern)
    if (match) return match[1]
  }
  for (const segment of cleaned.split(/&&|\|\||[;|\n]/)) {
    const words = segment.trim().split(/\s+/)
    const isMove =
      /^(cp|mv)$/.test(words[0]) || (words[0] === 'git' && words[1] === 'mv')
    const last = words.at(-1)?.replace(/^["']|["']$/g, '')
    if (isMove && last && new RegExp(String.raw`^${path}$`).test(last))
      return last
  }
  if (
    /writeFileSync|writeFile\(|appendFileSync|write_text|write_bytes|open\([^)]*["'](?:w|a|r\+)/.test(
      cleaned,
    )
  ) {
    // Quoted only: the path a script writes is a string literal, while a sibling `grep path` isn't.
    return cleaned.match(new RegExp(String.raw`["'](${path})["']`))?.[1]
  }
  return undefined
}

const target =
  filePath ?? (typeof command === 'string' ? bashTarget(command) : undefined)
if (target) process.stdout.write(target)
