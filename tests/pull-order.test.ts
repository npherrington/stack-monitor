import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { ListedPull } from '../core/types.ts'
import { movePull, orderedPulls } from '../web/lib/pull-order.ts'
import { pullPrefKey, type PullPrefs } from '../web/lib/pull-prefs.ts'

const ROOT = '/repos/app'

function pull(number: number): ListedPull {
  return {
    number,
    title: `PR ${number}`,
    author: 'someone',
    branch: `branch-${number}`,
    base: 'main',
    crossRepository: false,
    draft: false,
    url: '',
    reviewDecision: null,
    labels: [],
    updatedAt: '',
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    checks: 'none',
  }
}

// GitHub's order: most recently updated first.
const OPEN = [14, 12, 9, 3].map(pull)

const key = (number: number) => pullPrefKey(ROOT, number)

const numbers = (prefs: PullPrefs, pulls = OPEN) =>
  orderedPulls(ROOT, pulls, prefs).map((each) => each.number)

// Applies a move's places to the prefs, as the page does.
function moved(
  prefs: PullPrefs,
  ranks: Record<string, number> | null,
): PullPrefs {
  assert.ok(ranks !== null, 'the move should change the order')
  const next = { ...prefs }
  for (const [each, rank] of Object.entries(ranks)) {
    next[each] = { ...prefs[each], rank }
  }
  return next
}

// The moves themselves are row-order.ts's, which tests/checkout-order.test.ts covers.
describe('the order of a repo’s open PRs', () => {
  test('is GitHub’s, with pinned ones first, until someone moves a row', () => {
    assert.deepEqual(numbers({}), [14, 12, 9, 3])
    assert.deepEqual(numbers({ [key(9)]: { pinned: true } }), [9, 14, 12, 3])
  })

  test('a PR opened since a move goes above the ones given a place', () => {
    const prefs = moved({}, movePull(ROOT, OPEN, {}, 9, 14, 'before'))
    assert.deepEqual(numbers(prefs), [9, 14, 12, 3])
    assert.deepEqual(numbers(prefs, [pull(15), ...OPEN]), [15, 9, 14, 12, 3])
  })

  test('another repo’s PR of the same number keeps its own pin and place', () => {
    const prefs: PullPrefs = {
      [pullPrefKey('/repos/other', 3)]: { pinned: true, rank: 0 },
    }
    assert.deepEqual(numbers(prefs), [14, 12, 9, 3])
  })
})
