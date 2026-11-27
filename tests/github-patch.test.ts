import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { parsePatch } from '../core/github/patch.ts'

describe('parsePatch', () => {
  test('numbers each line on the side it is on', () => {
    const hunks = parsePatch(
      [
        '@@ -3,3 +3,4 @@ function a() {',
        ' keep',
        '-old',
        '+new',
        '+added',
        ' tail',
      ].join('\n'),
    )
    assert.equal(hunks.length, 1)
    assert.equal(hunks[0].header, '@@ -3,3 +3,4 @@ function a() {')
    assert.deepEqual(hunks[0].lines, [
      { kind: 'context', old: 3, new: 3, text: 'keep' },
      { kind: 'del', old: 4, new: null, text: 'old' },
      { kind: 'add', old: null, new: 4, text: 'new' },
      { kind: 'add', old: null, new: 5, text: 'added' },
      { kind: 'context', old: 5, new: 6, text: 'tail' },
    ])
  })

  test('restarts the numbers at each hunk', () => {
    const hunks = parsePatch(
      ['@@ -1 +1 @@', '-a', '+b', '@@ -40,2 +40,2 @@', ' x', '+y'].join('\n'),
    )
    assert.equal(hunks.length, 2)
    assert.deepEqual(hunks[1].lines[0], {
      kind: 'context',
      old: 40,
      new: 40,
      text: 'x',
    })
    assert.deepEqual(hunks[1].lines[1], {
      kind: 'add',
      old: null,
      new: 41,
      text: 'y',
    })
  })

  test('skips the no-newline marker and a trailing empty line', () => {
    const hunks = parsePatch(
      '@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n',
    )
    assert.deepEqual(
      hunks[0].lines.map((line) => line.kind),
      ['del', 'add'],
    )
  })

  test('answers no hunks for an empty patch', () => {
    assert.deepEqual(parsePatch(''), [])
  })
})
