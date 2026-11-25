import type { Checkout } from '../../core/types.ts'
import type { CheckoutFilters, CheckoutPrefs } from '@/lib/checkout-prefs.ts'

// What the filters leave of one repo's checkouts, pinned first, each group in git's order (primary
// first). Array.sort is stable, so git's order holds within a group.
export function visibleCheckouts(
  checkouts: Checkout[],
  prefs: CheckoutPrefs,
  filters: CheckoutFilters,
): Checkout[] {
  return checkouts
    .filter((checkout) => !(filters.hidePrimary && checkout.primary))
    .filter((checkout) => !(filters.hideMerged && checkout.merged))
    .filter(
      (checkout) =>
        !(filters.hideClean && checkout.changed === 0 && !checkout.ahead),
    )
    .sort(
      (a, b) =>
        Number(prefs[b.path]?.pinned === true) -
        Number(prefs[a.path]?.pinned === true),
    )
}
