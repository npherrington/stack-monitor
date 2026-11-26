import { serve, type Serving } from './http.ts'
import { makeRoutes, MAX_BODY_BYTES } from './routes.ts'
import type { Page } from './static.ts'
import { terminalSocket } from './terminal-socket.ts'

export interface MonitorOptions extends Page {
  port: number // 0 for one the system picks
  seed: string // the primary checkout of the repo it was started for
  settings: string // the settings file that lists the repos it tracks
}

// Resolves once the monitor listens on 127.0.0.1:<port>, with the way to stop it. Rejects with the
// listen error, EADDRINUSE when something holds the port.
export function startMonitor({
  port,
  seed,
  settings,
  ...page
}: MonitorOptions): Promise<Serving> {
  return serve({
    port,
    page,
    routes: makeRoutes({ seed, settings }),
    maxBodyBytes: MAX_BODY_BYTES,
    upgrades: { '/api/terminals/socket': terminalSocket },
  })
}
