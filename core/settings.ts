// The monitor's own settings: the repos it tracks. The one file it writes outside a repo, and only
// when the list changes.
import { createHash, randomBytes } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { z } from 'zod'

import { describeIssues } from './config/load.ts'
import { errorMessage } from './types.ts'

export const SETTINGS_ENV = 'STACK_MONITOR_SETTINGS'
// A dotfile, so it can't collide with a repo's fallback config, <dirname>.json, in the same folder.
export const SETTINGS_FILE = '.monitor.json'
// Beside the settings file: each tracked repo's personal config, which Settings → Stack writes.
export const PERSONAL_DIR = 'repos'
export const MAX_NAME = 60

export const RepoName = z.string().trim().min(1).max(MAX_NAME)

const TrackedRepoSchema = z.object({
  root: z.string().refine(isAbsolute, 'must be an absolute path'),
  name: RepoName,
})
export type TrackedRepo = z.output<typeof TrackedRepoSchema>

// Loose, so a key a later version writes survives this one rewriting the list.
const SettingsSchema = z.looseObject({ repos: z.array(TrackedRepoSchema) })
type Settings = z.output<typeof SettingsSchema>

export function settingsPath(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const named = env[SETTINGS_ENV]
  if (named) return resolve(named)
  return join(
    env.XDG_CONFIG_HOME || join(home, '.config'),
    'stack-monitor',
    SETTINGS_FILE,
  )
}

export type ReadSettings =
  | { found: false } // not set up yet
  | { found: true; settings: Settings }
  | { problem: string }

export function readSettings(path: string): ReadSettings {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { found: false }
    }
    return {
      problem: `Couldn't read the settings file ${path}: ${errorMessage(error)}`,
    }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return {
      problem: `The settings file ${path} isn't JSON: ${errorMessage(error)}`,
    }
  }
  const parsed = SettingsSchema.safeParse(raw)
  return parsed.success
    ? { found: true, settings: parsed.data }
    : {
        problem: `The settings file ${path} isn't valid: ${describeIssues(parsed.error.issues)}`,
      }
}

// Where the list is kept, and the repo it starts as before the file exists.
export interface Tracking {
  settings: string
  seed: string
}

export interface RepoList {
  settings: Settings // what to write back, with repos replaced
  repos: TrackedRepo[]
}

// The tracked repos, in the order they were added. Before the file exists, the repo the monitor was
// started for is the whole list.
export function readRepoList(
  path: string,
  seed: string,
): RepoList | { problem: string } {
  const read = readSettings(path)
  if ('problem' in read) return read
  if (!read.found) {
    const repos = [{ root: seed, name: basename(seed).slice(0, MAX_NAME) }]
    return { settings: { repos }, repos }
  }
  return { settings: read.settings, repos: read.settings.repos }
}

// This machine's own config for the repo at root, kept beside the settings file. The hash of the
// root keeps two repos with the same folder name apart.
export function personalConfigPath(settings: string, root: string): string {
  const hash = createHash('sha256').update(root).digest('hex').slice(0, 8)
  return join(dirname(settings), PERSONAL_DIR, `${basename(root)}-${hash}.json`)
}

// A temp file beside it, then a rename: a reader sees the old file or the new one, never half.
export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    renameSync(temp, path)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}

export function writeSettings(path: string, settings: Settings): void {
  writeJsonFile(path, settings)
}
