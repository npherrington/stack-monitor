// The project the ticket board last showed in this browser, which a bare /board opens again.
import { readId } from './board-links.ts'

const PROJECT_KEY = 'stack-monitor:board-project'

export function readLastProject(): number | null {
  try {
    return readId(localStorage.getItem(PROJECT_KEY))
  } catch {
    return null
  }
}

export function storeLastProject(id: number | null): void {
  try {
    if (id === null) localStorage.removeItem(PROJECT_KEY)
    else localStorage.setItem(PROJECT_KEY, String(id))
  } catch {
    // Storage is off or full: the board opens its first project instead.
  }
}
