// For an action whose mutation already raises the failure toast: the caller has nothing to add,
// so the rejection ends here rather than as an unhandled one.
export function quietly(action: Promise<unknown>): void {
  action.catch(() => undefined)
}
