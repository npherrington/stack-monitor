// What one person sets on the Checkouts page, per browser, keyed by checkout path: a pin, a
// nickname, a colour, and the filters. Not the server's: the MCP server and other browsers don't
// see them.

export const SWATCHES = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const

export type Swatch = (typeof SWATCHES)[number]

export interface CheckoutPref {
  colour?: Swatch
  pinned?: boolean
  nickname?: string
}

export type CheckoutPrefs = Record<string, CheckoutPref>

export interface CheckoutFilters {
  repo: string | null // a repo's root, or null for all
  hidePrimary: boolean
  hideMerged: boolean
  hideClean: boolean
}

export const NO_FILTERS: CheckoutFilters = {
  repo: null,
  hidePrimary: false,
  hideMerged: false,
  hideClean: false,
}

const PREFS_KEY = 'stack-monitor-checkouts'
const FILTERS_KEY = 'stack-monitor-checkout-filters'

function isSwatch(value: unknown): value is Swatch {
  return SWATCHES.includes(value as Swatch)
}

function parsePref(value: unknown): CheckoutPref {
  if (typeof value !== 'object' || value === null) return {}
  const raw = value as Record<string, unknown>
  const nickname =
    typeof raw.nickname === 'string' ? raw.nickname.trim() : undefined
  return {
    colour: isSwatch(raw.colour) ? raw.colour : undefined,
    pinned: raw.pinned === true ? true : undefined,
    nickname: nickname === '' ? undefined : nickname,
  }
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // The change lasts until the page reloads.
  }
}

// Storage can throw, or hold what an older page wrote: both start empty.
export function readPrefs(): CheckoutPrefs {
  const raw = readJson(PREFS_KEY)
  if (typeof raw !== 'object' || raw === null) return {}
  return Object.fromEntries(
    Object.entries(raw).map(([path, pref]) => [path, parsePref(pref)]),
  )
}

export function savePrefs(prefs: CheckoutPrefs): void {
  writeJson(PREFS_KEY, prefs)
}

export function readFilters(): CheckoutFilters {
  const raw = readJson(FILTERS_KEY)
  if (typeof raw !== 'object' || raw === null) return NO_FILTERS
  const r = raw as Record<string, unknown>
  return {
    repo: typeof r.repo === 'string' ? r.repo : null,
    hidePrimary: r.hidePrimary === true,
    hideMerged: r.hideMerged === true,
    hideClean: r.hideClean === true,
  }
}

export function saveFilters(filters: CheckoutFilters): void {
  writeJson(FILTERS_KEY, filters)
}
