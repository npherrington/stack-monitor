// What the ticket board remembers in this browser: the project it last showed, which a bare /board
// opens again, and the repo each project's sessions were last started in.
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

const REPOS_KEY = 'stack-monitor:board-repos'

function readRepos(): Record<string, unknown> {
  const stored: unknown = JSON.parse(localStorage.getItem(REPOS_KEY) ?? '{}')
  return typeof stored === 'object' && stored !== null && !Array.isArray(stored)
    ? (stored as Record<string, unknown>)
    : {}
}

// The repo a session was last started in for this project: its primary checkout's path.
export function readLastRepo(project: number): string | null {
  try {
    const root = readRepos()[String(project)]
    return typeof root === 'string' ? root : null
  } catch {
    return null
  }
}

export function storeLastRepo(project: number, root: string): void {
  try {
    localStorage.setItem(
      REPOS_KEY,
      JSON.stringify({ ...readRepos(), [String(project)]: root }),
    )
  } catch {
    // Storage is off, full or holds something else: the dialog starts on the first repo.
  }
}
