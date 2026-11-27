// A file's unified diff, as GitHub's `patch` field holds it, into hunks of numbered lines: a line
// comment names its line by number and side.
import type { DiffHunk, DiffLine } from '../types.ts'

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function parsePatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let hunk: DiffHunk | null = null
  let old = 0
  let next = 0
  for (const raw of patch.split('\n')) {
    const header = HUNK.exec(raw)
    if (header !== null) {
      hunk = { header: raw, lines: [] }
      hunks.push(hunk)
      old = Number(header[1])
      next = Number(header[2])
      continue
    }
    if (hunk === null) continue
    const mark = raw[0]
    const text = raw.slice(1)
    let line: DiffLine
    if (mark === '+') {
      line = { kind: 'add', old: null, new: next++, text }
    } else if (mark === '-') {
      line = { kind: 'del', old: old++, new: null, text }
    } else if (mark === ' ') {
      line = { kind: 'context', old: old++, new: next++, text }
    } else {
      continue // "\ No newline at end of file", or the empty line after a final newline
    }
    hunk.lines.push(line)
  }
  return hunks
}
