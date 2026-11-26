import type { Checkout } from '../../core/types.ts'
// Relative, not `@/`: tests/checkout-order.test.ts runs this file under node, which has no alias.
import type { CheckoutFilters, CheckoutPrefs } from './checkout-prefs.ts'

const pinned = (prefs: CheckoutPrefs, path: string) =>
  prefs[path]?.pinned === true

// A repo's checkouts in the order the page lists them: pinned first; within each group, the ones
// someone has moved by the place they gave them, then the rest in git's order (primary first).
// toSorted is stable, so git's order holds where nothing else decides.
export function orderedCheckouts(
  checkouts: Checkout[],
  prefs: CheckoutPrefs,
): Checkout[] {
  const rank = (path: string) => prefs[path]?.rank ?? Infinity
  return checkouts.toSorted(
    (a, b) =>
      Number(pinned(prefs, b.path)) - Number(pinned(prefs, a.path)) ||
      (rank(a.path) === rank(b.path) ? 0 : rank(a.path) - rank(b.path)),
  )
}

// What the filters leave of one repo's checkouts, in the order above.
export function visibleCheckouts(
  checkouts: Checkout[],
  prefs: CheckoutPrefs,
  filters: CheckoutFilters,
): Checkout[] {
  return orderedCheckouts(
    checkouts
      .filter((checkout) => !(filters.hidePrimary && checkout.primary))
      .filter((checkout) => !(filters.hideMerged && checkout.merged))
      .filter(
        (checkout) =>
          !(filters.hideClean && checkout.changed === 0 && !checkout.ahead),
      ),
    prefs,
  )
}

export type Place = 'before' | 'after'

// Moves one checkout to just before or after another in its repo's list, and gives every
// checkout of the repo its new place. Null when the move changes nothing, or would cross from
// the pinned to the unpinned group, where pinning decides.
export function moveCheckout(
  checkouts: Checkout[],
  prefs: CheckoutPrefs,
  path: string,
  target: string,
  place: Place,
): Record<string, number> | null {
  if (path === target || pinned(prefs, path) !== pinned(prefs, target)) {
    return null
  }
  const order = orderedCheckouts(checkouts, prefs).map((each) => each.path)
  if (!order.includes(path) || !order.includes(target)) return null
  const rest = order.filter((each) => each !== path)
  const at = rest.indexOf(target) + (place === 'after' ? 1 : 0)
  const next = [...rest.slice(0, at), path, ...rest.slice(at)]
  if (next.every((each, index) => each === order[index])) return null
  return Object.fromEntries(next.map((each, index) => [each, index]))
}
