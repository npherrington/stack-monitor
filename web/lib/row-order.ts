// The order of a list someone can pin rows in and move them around: worktrees, PRs. Each row has
// an id, and its pin and place are kept against that id.

export interface RowPref {
  pinned?: boolean
  rank?: number // its place in the list, once someone has moved a row there
}

export type Place = 'before' | 'after'

const pinned = (prefs: Record<string, RowPref>, id: string) =>
  prefs[id]?.pinned === true

// Which side of the moved rows a row nobody has moved goes: a new worktree after them, a new PR
// before them, as GitHub lists the newest first.
export type Unplaced = 'last' | 'first'

// Pinned first; within each group, the rows someone has moved by the place they gave them, with
// the rest on the `unplaced` side in the order they came. toSorted is stable, so that order holds
// where nothing else decides.
export function orderedRows<Row>(
  rows: Row[],
  idOf: (row: Row) => string,
  prefs: Record<string, RowPref>,
  unplaced: Unplaced = 'last',
): Row[] {
  const rank = (row: Row) =>
    prefs[idOf(row)]?.rank ?? (unplaced === 'last' ? Infinity : -Infinity)
  return rows.toSorted(
    (a, b) =>
      Number(pinned(prefs, idOf(b))) - Number(pinned(prefs, idOf(a))) ||
      (rank(a) === rank(b) ? 0 : rank(a) - rank(b)),
  )
}

// Moves one row to just before or after another, and gives every row its new place. `order` is
// the ids as orderedRows lists them. Null when the move changes nothing, or would cross from the
// pinned to the unpinned group, where pinning decides.
export function moveRow(
  order: string[],
  prefs: Record<string, RowPref>,
  id: string,
  target: string,
  place: Place,
): Record<string, number> | null {
  if (id === target || pinned(prefs, id) !== pinned(prefs, target)) return null
  if (!order.includes(id) || !order.includes(target)) return null
  const rest = order.filter((each) => each !== id)
  const at = rest.indexOf(target) + (place === 'after' ? 1 : 0)
  const next = [...rest.slice(0, at), id, ...rest.slice(at)]
  if (next.every((each, index) => each === order[index])) return null
  return Object.fromEntries(next.map((each, index) => [each, index]))
}
