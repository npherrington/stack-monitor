// A due date (YYYY-MM-DD) as "28 Nov", with the year when it isn't this one. Built from its
// parts: new Date('2026-11-28') is midnight UTC, which is the day before in the Americas.
export function formatDay(day: string, now: Date = new Date()): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: year === now.getFullYear() ? undefined : 'numeric',
  })
}

// When a comment was written or a ticket archived: "28 Nov 2026, 14:05".
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
