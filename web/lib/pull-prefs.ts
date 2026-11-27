// What one person sets on a repo's PR list, per browser: a pin, a colour and a place in the list.
// Not the server's: the MCP server and other browsers don't see them.

import { isSwatch, type Swatch } from './swatches.ts'

export interface PullPref {
  colour?: Swatch
  pinned?: boolean
  rank?: number // its place in its repo's list, once someone has moved a row there
}

export type PullPrefs = Record<string, PullPref> // by pullPrefKey

const PREFS_KEY = 'stack-monitor-pulls'

// PR numbers repeat between repos, so a pref is kept against the repo's root too.
export function pullPrefKey(root: string, number: number): string {
  return `${root}#${number}`
}

function parsePref(value: unknown): PullPref {
  if (typeof value !== 'object' || value === null) return {}
  const raw = value as Record<string, unknown>
  return {
    colour: isSwatch(raw.colour) ? raw.colour : undefined,
    pinned: raw.pinned === true ? true : undefined,
    rank:
      typeof raw.rank === 'number' && Number.isFinite(raw.rank)
        ? raw.rank
        : undefined,
  }
}

// Storage can throw, or hold what an older page wrote: both start empty.
export function readPullPrefs(): PullPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return {}
    return Object.fromEntries(
      Object.entries(raw).map(([key, pref]) => [key, parsePref(pref)]),
    )
  } catch {
    return {}
  }
}

export function savePullPrefs(prefs: PullPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // The change lasts until the page reloads.
  }
}
