import { loadConfig } from '../core/config/load.ts'
import { modulesOf } from '../core/config/schema.ts'
import type { Health } from '../core/monitor-address.ts'
import type { ConfigStatus } from '../core/types.ts'
import { primaryRoot } from '../core/worktrees/clone.ts'
import type { Routes } from './http.ts'

// Of the largest body a route takes. None takes one yet.
export const MAX_BODY_BYTES = 64 * 1024

// The config the primary checkout's clone has now, and which modules it turns on.
export async function readConfigStatus(repo: string): Promise<ConfigStatus> {
  const loaded = loadConfig({ primary: await primaryRoot(repo) })
  return loaded.ok
    ? { ok: true, repo, source: loaded.path, modules: modulesOf(loaded.config) }
    : { ok: false, repo, source: loaded.path, problem: loaded.problem }
}

// repo: the checkout the monitor serves the clone through.
export function makeRoutes(repo: string): Routes {
  return {
    'GET /api/health': async () => {
      const health: Health = {
        app: 'stack-monitor',
        root: repo,
        pid: process.pid,
      }
      return [200, health]
    },
    'GET /api/config': async () => [200, await readConfigStatus(repo)],
  }
}
