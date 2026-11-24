// Where the monitor listens, and how another process tells that the port's holder is one.
import { z } from 'zod'

// STACK_MONITOR_PORT overrides it. Keep it clear of the ports your checkouts' services use.
const MONITOR_PORT = 7420
const PROBE_TIMEOUT_MS = 1000

// What GET /api/health answers.
export const HealthSchema = z.object({
  app: z.literal('stack-monitor'),
  root: z.string(), // the checkout it serves the clone through
  pid: z.number(),
})
export type Health = z.infer<typeof HealthSchema>

export function monitorUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

// The port STACK_MONITOR_PORT names, or the default when it's unset. error: what it holds isn't a
// port a user's process can listen on.
export function readMonitorPort(
  raw = process.env.STACK_MONITOR_PORT,
): { port: number } | { error: string } {
  if (raw === undefined || raw === '') return { port: MONITOR_PORT }
  // Digits only: Number() alone also takes 1e4, 0x1F90 and a padded " 7420".
  const port = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return {
      error: `STACK_MONITOR_PORT=${raw} isn't a port from 1024 to 65535.`,
    }
  }
  return { port }
}

// The monitor answering on the port, or null when nothing does within timeoutMs or it's another
// program.
export async function findMonitor(
  port: number,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<Health | null> {
  try {
    const response = await fetch(`${monitorUrl(port)}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return HealthSchema.parse(await response.json())
  } catch {
    return null
  }
}
