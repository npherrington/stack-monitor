// Starting the monitor for a host: `mise run dev` (server/main.ts) and the desktop app
// (app/main.ts). Until the settings file is first written, the repos are the one STACK_MONITOR_REPO
// names, or the one it's started in.
import {
  findMonitor,
  MONITOR_HOME,
  monitorUrl,
  readMonitorPort,
  type Health,
} from '../core/monitor-address.ts'
import {
  scheduleContext,
  startScheduleTicker,
} from '../core/schedules/schedules.ts'
import { schedulesDir } from '../core/schedules/store.ts'
import { settingsPath } from '../core/settings.ts'
import { findRepo, primaryRoot } from '../core/worktrees/clone.ts'
import type { Serving } from './http.ts'
import { startMonitor } from './monitor.ts'
import type { Page } from './static.ts'

export type Launched =
  | { started: true; url: string; settings: string; serving: Serving }
  | { started: false; url: string; running: Health } // a monitor already serves the port
  | { error: string }

function inUse(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
}

// How many ports past the default the app tries when another program, or another copy of the
// monitor, holds it.
const FALLBACK_PORTS = 20

// fallback: on a port held by something that isn't this monitor, take the next free one.
export async function launchMonitor(
  page: Page,
  from: string,
  { fallback = false }: { fallback?: boolean } = {},
): Promise<Launched> {
  const address = readMonitorPort()
  if ('error' in address) return { error: address.error }
  const repo = await findRepo(process.env.STACK_MONITOR_REPO || from)
  if ('error' in repo) {
    return {
      error: `${repo.error}. Set STACK_MONITOR_REPO to a checkout of the repo to serve.`,
    }
  }
  const seed = await primaryRoot(repo.root)
  const settings = settingsPath()
  const tries = fallback ? FALLBACK_PORTS + 1 : 1
  let serving: Serving | null = null
  let port = address.port
  for (let attempt = 0; attempt < tries; attempt++) {
    port = address.port + attempt
    try {
      serving = await startMonitor({ port, seed, settings, ...page })
      break
    } catch (error) {
      if (!inUse(error)) throw error
      const running = await findMonitor(port)
      if (running?.home === MONITOR_HOME) {
        return { started: false, url: monitorUrl(port), running }
      }
      if (attempt < tries - 1) continue
      return {
        error:
          running === null
            ? `Port ${port} is held by another program. Set STACK_MONITOR_PORT to a free one.`
            : `Port ${port} is held by a different stack monitor, for ${running.root}${running.home === undefined ? '' : ` from ${running.home}`}. Stop it, or set STACK_MONITOR_PORT to a free port.`,
      }
    }
  }
  if (serving === null) return { error: `No free port from ${address.port}` }
  // Schedules set to fire from the monitor fire while it runs; launchd ones fire without it.
  startScheduleTicker({ settings, seed }, scheduleContext(schedulesDir()))
  return { started: true, url: monitorUrl(port), settings, serving }
}
