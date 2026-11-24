// Finding and reading a repo's config. Read on every request, as everything else is, so an edit
// shows on the next page load.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import type { z } from 'zod'

import { errorMessage } from '../types.ts'
import { ConfigSchema, type Config } from './schema.ts'

export const CONFIG_FILE = 'stack-monitor.json'
export const CONFIG_ENV = 'STACK_MONITOR_CONFIG'
const SHOWN_ISSUES = 5

export type LoadedConfig =
  | { ok: true; path: string | null; config: Config } // path null: no file, the defaults
  | { ok: false; path: string; problem: string }

interface Where {
  primary: string // the primary checkout's root
  env?: NodeJS.ProcessEnv
  home?: string
}

interface Candidate {
  path: string
  required: boolean // named outright, so its absence is a problem rather than a miss
}

// Where a config is looked for, first match wins. STACK_MONITOR_CONFIG is the only place looked
// when it's set: a typo in it mustn't fall through to some other file.
export function configCandidates({
  primary,
  env = process.env,
  home = homedir(),
}: Where): Candidate[] {
  const named = env[CONFIG_ENV]
  if (named) return [{ path: resolve(named), required: true }]
  const userDir = join(
    env.XDG_CONFIG_HOME || join(home, '.config'),
    'stack-monitor',
  )
  return [
    { path: join(primary, CONFIG_FILE), required: false },
    { path: join(userDir, `${basename(primary)}.json`), required: false },
  ]
}

function describeIssues(issues: z.core.$ZodIssue[]): string {
  const shown = issues.slice(0, SHOWN_ISSUES).map((issue) => {
    const at = issue.path.map(String).join('.')
    return at === '' ? issue.message : `${at}: ${issue.message}`
  })
  const more = issues.length - shown.length
  return shown.join('; ') + (more > 0 ? `; and ${more} more` : '')
}

// The text of the first candidate there is, or null when none is.
function readFirst(
  candidates: Candidate[],
): { path: string; text: string } | { path: string; problem: string } | null {
  for (const { path, required } of candidates) {
    try {
      return { path, text: readFileSync(path, 'utf8') }
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException
      if (code === 'ENOENT' && !required) continue
      if (code === 'ENOENT') {
        return {
          path,
          problem: `${CONFIG_ENV} names ${path}, which doesn't exist`,
        }
      }
      return { path, problem: `Couldn't read ${path}: ${errorMessage(error)}` }
    }
  }
  return null
}

export function loadConfig(where: Where): LoadedConfig {
  const found = readFirst(configCandidates(where))
  if (found === null) {
    return { ok: true, path: null, config: ConfigSchema.parse({}) }
  }
  const { path } = found
  if ('problem' in found) return { ok: false, path, problem: found.problem }
  let raw: unknown
  try {
    raw = JSON.parse(found.text)
  } catch (error) {
    return {
      ok: false,
      path,
      problem: `${path} isn't JSON: ${errorMessage(error)}`,
    }
  }
  const parsed = ConfigSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, path, config: parsed.data }
    : {
        ok: false,
        path,
        problem: `${path}: ${describeIssues(parsed.error.issues)}`,
      }
}
