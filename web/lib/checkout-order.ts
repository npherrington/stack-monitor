import type { Checkout } from '../../core/types.ts'
// Relative, not `@/`: tests/checkout-order.test.ts runs this file under node, which has no alias.
import type { CheckoutFilters, CheckoutPrefs } from './checkout-prefs.ts'
import { moveRow, orderedRows, type Place } from './row-order.ts'

const pathOf = (checkout: Checkout) => checkout.path

// A repo's checkouts in the order the page lists them: pinned first, then the ones someone has
// moved, then the rest in git's order (primary first).
export function orderedCheckouts(
  checkouts: Checkout[],
  prefs: CheckoutPrefs,
): Checkout[] {
  return orderedRows(checkouts, pathOf, prefs)
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
  return moveRow(
    orderedCheckouts(checkouts, prefs).map(pathOf),
    prefs,
    path,
    target,
    place,
  )
}
