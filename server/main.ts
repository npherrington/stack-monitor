// `mise run dev`: serves the monitor, which tracks the repos its settings file lists.
import { resolve } from 'node:path'

import { launchMonitor } from './launch.ts'

const DIST = resolve(import.meta.dirname, '..', 'dist')
const UNBUILT = "The page isn't built. Run mise run build."

const launched = await launchMonitor(
  { dist: DIST, unbuilt: UNBUILT },
  process.cwd(),
)
if ('error' in launched) {
  console.error(launched.error)
  process.exit(1)
}
if (!launched.started) {
  console.error(
    `A monitor for ${launched.running.root} (pid ${launched.running.pid}) already serves ${launched.url}. Stop it, or set STACK_MONITOR_PORT.`,
  )
  process.exit(1)
}
console.log(
  `Stack monitor on ${launched.url}, its repos listed in ${launched.settings}`,
)
