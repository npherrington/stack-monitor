// The shapes the server answers with and the page reads. Imports nothing from Node, so the page
// can import it too.

// What every action answers: done or refused, what happened, and the log to look at when there is
// one.
export interface ActionResult {
  ok: boolean
  message: string
  log: string | null
}

export function failure(
  message: string,
  log: string | null = null,
): ActionResult {
  return { ok: false, message, log }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const MODULE_NAMES = [
  'worktrees',
  'stack',
  'agents',
  'featureMap',
] as const
export type ModuleName = (typeof MODULE_NAMES)[number]
export type Modules = Record<ModuleName, boolean>

// GET /api/config. source: the config file read, or null when there's none and the defaults apply.
export type ConfigStatus =
  | { ok: true; repo: string; source: string | null; modules: Modules }
  | { ok: false; repo: string; source: string; problem: string }
