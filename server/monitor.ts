import { serve, type Serving } from './http.ts'
import { makeRoutes, MAX_BODY_BYTES } from './routes.ts'
import type { Page } from './static.ts'

export interface MonitorOptions extends Page {
  port: number // 0 for one the system picks
  repo: string // the checkout it serves the clone through
}

// Resolves once the monitor listens on 127.0.0.1:<port>, with the way to stop it. Rejects with the
// listen error, EADDRINUSE when something holds the port.
export function startMonitor({
  port,
  repo,
  ...page
}: MonitorOptions): Promise<Serving> {
  return serve({
    port,
    page,
    routes: makeRoutes(repo),
    maxBodyBytes: MAX_BODY_BYTES,
  })
}
