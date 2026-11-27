// One detached element per key ('page', or a session id) that the page or a terminal is portalled
// into once, and that whichever pane shows it adopts. Moving a pane through the tree then moves
// the element, rather than remounting what's in it: no reconnect, no replay, no lost page state.
// `contents`, so what's inside lays out as if the element weren't there.
const elements = new Map<string, HTMLDivElement>()

export function held(key: string): HTMLDivElement {
  let element = elements.get(key)
  if (element === undefined) {
    element = document.createElement('div')
    element.className = 'contents'
    elements.set(key, element)
  }
  return element
}

// Drops the elements of keys no longer in use: sessions that have ended.
export function releaseExcept(keys: ReadonlySet<string>): void {
  for (const [key, element] of elements) {
    if (keys.has(key)) continue
    element.remove()
    elements.delete(key)
  }
}
