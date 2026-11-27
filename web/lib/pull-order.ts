import type { ListedPull } from '../../core/types.ts'
// Relative, not `@/`: tests/pull-order.test.ts runs this file under node, which has no alias.
import { pullPrefKey, type PullPrefs } from './pull-prefs.ts'
import { moveRow, orderedRows, type Place } from './row-order.ts'

// A repo's open PRs in the order the page lists them: pinned first, then the ones someone has
// moved, with any PR opened since above them, in GitHub's order (most recently updated first).
export function orderedPulls(
  root: string,
  pulls: ListedPull[],
  prefs: PullPrefs,
): ListedPull[] {
  return orderedRows(
    pulls,
    (pull) => pullPrefKey(root, pull.number),
    prefs,
    'first',
  )
}

// Moves one PR to just before or after another, and gives every open PR of the repo its new
// place, by pullPrefKey. Null when the move changes nothing, or would cross from the pinned to the
// unpinned group.
export function movePull(
  root: string,
  pulls: ListedPull[],
  prefs: PullPrefs,
  number: number,
  target: number,
  place: Place,
): Record<string, number> | null {
  return moveRow(
    orderedPulls(root, pulls, prefs).map((pull) =>
      pullPrefKey(root, pull.number),
    ),
    prefs,
    pullPrefKey(root, number),
    pullPrefKey(root, target),
    place,
  )
}
