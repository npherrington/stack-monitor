import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { Checkout } from '../core/types.ts'
import { moveCheckout, orderedCheckouts } from '../web/lib/checkout-order.ts'
import type { CheckoutPrefs } from '../web/lib/checkout-prefs.ts'

function checkout(path: string): Checkout {
  return {
    path,
    primary: path === 'main',
    branch: path,
    head: '',
    changed: 0,
    ahead: 0,
    behind: 0,
    merged: false,
    locked: false,
    prunable: false,
    problem: null,
    services: [],
  }
}

// git's order: the primary, then the worktrees.
const REPO = ['main', 'a', 'b', 'c'].map(checkout)

const paths = (prefs: CheckoutPrefs) =>
  orderedCheckouts(REPO, prefs).map((each) => each.path)

// Applies a move's places to the prefs, as the page does.
function moved(
  prefs: CheckoutPrefs,
  ranks: Record<string, number> | null,
): CheckoutPrefs {
  assert.ok(ranks !== null, 'the move should change the order')
  return Object.fromEntries(
    REPO.map(({ path }) => [path, { ...prefs[path], rank: ranks[path] }]),
  )
}

describe('the order of a repo’s worktrees', () => {
  test('is git’s, with pinned ones first, until someone moves a row', () => {
    assert.deepEqual(paths({}), ['main', 'a', 'b', 'c'])
    assert.deepEqual(paths({ b: { pinned: true } }), ['b', 'main', 'a', 'c'])
  })

  test('a row moved before or after another stays there', () => {
    const once = moved({}, moveCheckout(REPO, {}, 'c', 'main', 'before'))
    assert.deepEqual(paths(once), ['c', 'main', 'a', 'b'])
    const twice = moved(once, moveCheckout(REPO, once, 'c', 'a', 'after'))
    assert.deepEqual(paths(twice), ['main', 'a', 'c', 'b'])
  })

  test('a new worktree goes after the ones given a place', () => {
    const prefs = moved({}, moveCheckout(REPO, {}, 'b', 'main', 'before'))
    const grown = [...REPO, checkout('d')]
    assert.deepEqual(
      orderedCheckouts(grown, prefs).map((each) => each.path),
      ['b', 'main', 'a', 'c', 'd'],
    )
  })

  test('pinning still decides between the groups', () => {
    const prefs: CheckoutPrefs = { c: { pinned: true } }
    assert.equal(moveCheckout(REPO, prefs, 'a', 'c', 'before'), null)
    const within = moved(
      prefs,
      moveCheckout(REPO, prefs, 'b', 'main', 'before'),
    )
    assert.deepEqual(paths(within), ['c', 'b', 'main', 'a'])
  })

  test('a move that changes nothing is no move', () => {
    assert.equal(moveCheckout(REPO, {}, 'a', 'a', 'before'), null)
    assert.equal(moveCheckout(REPO, {}, 'a', 'b', 'before'), null)
    assert.equal(moveCheckout(REPO, {}, 'a', 'gone', 'before'), null)
  })
})
