// `mise run dev`: serves the monitor, which tracks the repos its settings file lists. Until that
// file is first written, the list is the repo STACK_MONITOR_REPO names, or the one it's started in.
import { resolve } from 'node:path'

import {
  findMonitor,
  monitorUrl,
  readMonitorPort,
} from '../core/monitor-address.ts'
import {
  scheduleContext,
  startScheduleTicker,
} from '../core/schedules/schedules.ts'
import { schedulesDir } from '../core/schedules/store.ts'
import { settingsPath } from '../core/settings.ts'
import { findRepo, primaryRoot } from '../core/worktrees/clone.ts'
import { startMonitor } from './monitor.ts'

const DIST = resolve(import.meta.dirname, '..', 'dist')
const UNBUILT = "The page isn't built. Run mise run build."

function inUse(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
}

async function main(): Promise<number> {
  const address = readMonitorPort()
  if ('error' in address) {
    console.error(address.error)
    return 1
  }
  const { port } = address
  const repo = await findRepo(process.env.STACK_MONITOR_REPO || process.cwd())
  if ('error' in repo) {
    console.error(
      `${repo.error}. Set STACK_MONITOR_REPO to a checkout of the repo to serve.`,
    )
    return 1
  }
  const seed = await primaryRoot(repo.root)
  const settings = settingsPath()
  try {
    await startMonitor({ port, seed, settings, dist: DIST, unbuilt: UNBUILT })
  } catch (error) {
    if (!inUse(error)) throw error
    const running = await findMonitor(port)
    console.error(
      running === null
        ? `Port ${port} is held by another program. Set STACK_MONITOR_PORT to a free one.`
        : `A monitor for ${running.root} (pid ${running.pid}) already serves ${monitorUrl(port)}. Stop it, or set STACK_MONITOR_PORT.`,
    )
    return 1
  }
  // Schedules set to fire from the monitor fire while it runs; launchd ones fire without it.
  startScheduleTicker({ settings, seed }, scheduleContext(schedulesDir()))
  console.log(
    `Stack monitor on ${monitorUrl(port)}, its repos listed in ${settings}`,
  )
  return 0
}

const code = await main()
if (code !== 0) process.exit(code)
