// Starting the monitor for a host: `mise run dev` (server/main.ts) and the desktop app
// (app/main.ts). Until the settings file is first written, the repos are the one STACK_MONITOR_REPO
// names, or the one it's started in.
import {
  findMonitor,
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

export async function launchMonitor(
  page: Page,
  from: string,
): Promise<Launched> {
  const address = readMonitorPort()
  if ('error' in address) return { error: address.error }
  const { port } = address
  const repo = await findRepo(process.env.STACK_MONITOR_REPO || from)
  if ('error' in repo) {
    return {
      error: `${repo.error}. Set STACK_MONITOR_REPO to a checkout of the repo to serve.`,
    }
  }
  const seed = await primaryRoot(repo.root)
  const settings = settingsPath()
  let serving: Serving
  try {
    serving = await startMonitor({ port, seed, settings, ...page })
  } catch (error) {
    if (!inUse(error)) throw error
    const running = await findMonitor(port)
    if (running !== null) {
      return { started: false, url: monitorUrl(port), running }
    }
    return {
      error: `Port ${port} is held by another program. Set STACK_MONITOR_PORT to a free one.`,
    }
  }
  // Schedules set to fire from the monitor fire while it runs; launchd ones fire without it.
  startScheduleTicker({ settings, seed }, scheduleContext(schedulesDir()))
  return { started: true, url: monitorUrl(port), settings, serving }
}
