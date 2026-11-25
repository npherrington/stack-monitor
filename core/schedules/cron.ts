// Five-field cron (minute hour day-of-month month day-of-week), in local time. Fields take *,
// numbers, a-b ranges, lists, /steps, and names for months and days; @hourly, @daily, @weekly,
// @monthly and @yearly stand in for a whole line. As in cron, when both day fields are restricted a
// time matches either. No Node APIs: the page imports this to show the next fires as you type.

export interface Cron {
  minute: Set<number>
  hour: Set<number>
  day: Set<number>
  month: Set<number>
  weekday: Set<number> // 0 is Sunday
  dayRestricted: boolean
  weekdayRestricted: boolean
}

interface FieldSpec {
  name: string
  min: number
  max: number
  names?: string[]
}

const FIELDS: FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  {
    name: 'month',
    min: 1,
    max: 12,
    names: 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' '),
  },
  {
    name: 'day of week',
    min: 0,
    max: 7,
    names: 'sun mon tue wed thu fri sat'.split(' '),
  },
]

const PRESETS: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
}

function value(text: string, spec: FieldSpec): number | null {
  const named = spec.names?.indexOf(text.toLowerCase()) ?? -1
  if (named !== -1) return named + (spec.name === 'month' ? 1 : 0)
  if (!/^\d+$/.test(text)) return null
  const number = Number(text)
  return number >= spec.min && number <= spec.max ? number : null
}

function field(text: string, spec: FieldSpec): Set<number> | string {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const [range, stepText, extra] = part.split('/')
    if (extra !== undefined) return `the ${spec.name} has two /s`
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) {
      return `the ${spec.name}'s step ${stepText} isn't a whole number above 0`
    }
    let low: number | null
    let high: number | null
    if (range === '*') {
      low = spec.min
      high = spec.max
    } else if (range.includes('-')) {
      const [a, b] = range.split('-')
      low = value(a, spec)
      high = value(b, spec)
    } else {
      low = value(range, spec)
      high = stepText === undefined ? low : spec.max
    }
    if (low === null || high === null || low > high) {
      return `the ${spec.name} ${part} isn't in ${spec.min}-${spec.max}`
    }
    for (let at = low; at <= high; at += step) out.add(at)
  }
  if (spec.name === 'day of week' && out.delete(7)) out.add(0)
  return out
}

function full(set: Set<number>, min: number, max: number): boolean {
  return set.size === max - min + 1
}

export function parseCron(text: string): Cron | { problem: string } {
  const line = PRESETS[text.trim().toLowerCase()] ?? text.trim()
  const parts = line.split(/\s+/)
  if (parts.length !== 5) {
    return {
      problem: `A cron line has 5 fields (minute hour day month weekday); this has ${parts.length}`,
    }
  }
  const sets: Set<number>[] = []
  for (const [at, part] of parts.entries()) {
    const parsed = field(part, FIELDS[at])
    if (typeof parsed === 'string') return { problem: parsed }
    sets.push(parsed)
  }
  const [minute, hour, day, month, weekday] = sets
  return {
    minute,
    hour,
    day,
    month,
    weekday,
    dayRestricted: !full(day, 1, 31),
    weekdayRestricted: weekday.size !== 7,
  }
}

export function matches(cron: Cron, at: Date): boolean {
  if (!cron.minute.has(at.getMinutes()) || !cron.hour.has(at.getHours())) {
    return false
  }
  if (!cron.month.has(at.getMonth() + 1)) return false
  const onDay = cron.day.has(at.getDate())
  const onWeekday = cron.weekday.has(at.getDay())
  if (cron.dayRestricted && cron.weekdayRestricted) return onDay || onWeekday
  return onDay && onWeekday
}

// The next times it fires after `from`, looking up to a year and a day ahead.
export function nextFires(cron: Cron, from: Date, count: number): Date[] {
  const out: Date[] = []
  const at = new Date(from)
  at.setSeconds(0, 0)
  const end = from.getTime() + 367 * 24 * 60 * 60 * 1000
  while (out.length < count && at.getTime() <= end) {
    at.setMinutes(at.getMinutes() + 1)
    if (!cron.month.has(at.getMonth() + 1)) {
      at.setMonth(at.getMonth() + 1, 1)
      at.setHours(0, -1)
      continue
    }
    if (!cron.hour.has(at.getHours())) {
      at.setMinutes(59)
      continue
    }
    if (matches(cron, at)) out.push(new Date(at))
  }
  return out
}

// The cron line as launchd's StartCalendarInterval: one dict per combination, an absent key
// meaning any. Both day fields restricted is either one, so each gets its own dicts.
export function calendarIntervals(cron: Cron): Record<string, number>[] {
  const keyed: [string, Set<number>, boolean][] = [
    ['Minute', cron.minute, !full(cron.minute, 0, 59)],
    ['Hour', cron.hour, !full(cron.hour, 0, 23)],
    ['Month', cron.month, !full(cron.month, 1, 12)],
  ]
  let dicts: Record<string, number>[] = [{}]
  for (const [key, set, restricted] of keyed) {
    if (!restricted) continue
    dicts = dicts.flatMap((dict) =>
      [...set]
        .toSorted((a, b) => a - b)
        .map((each) => ({ ...dict, [key]: each })),
    )
  }
  const days = (key: string, set: Set<number>) =>
    dicts.flatMap((dict) =>
      [...set]
        .toSorted((a, b) => a - b)
        .map((each) => ({ ...dict, [key]: each })),
    )
  if (cron.dayRestricted && cron.weekdayRestricted) {
    return [...days('Day', cron.day), ...days('Weekday', cron.weekday)]
  }
  if (cron.dayRestricted) return days('Day', cron.day)
  if (cron.weekdayRestricted) return days('Weekday', cron.weekday)
  return dicts
}
