// The repos the monitor tracks: the list in the settings file, and each repo's config read now.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { z } from 'zod'

import { loadConfig, type LoadedConfig, type Where } from './config/load.ts'
import { modulesOf } from './config/schema.ts'
import {
  MAX_NAME,
  personalConfigPath,
  readRepoList,
  RepoName,
  writeSettings,
  type RepoList,
  type TrackedRepo,
  type Tracking,
} from './settings.ts'
import {
  errorMessage,
  failure,
  type ActionResult,
  type ConfigStatus,
  type RepoStatus,
} from './types.ts'
import {
  canonical,
  findRepo,
  primaryRoot,
  whyUnreadable,
} from './worktrees/clone.ts'

// Handed to git and the filesystem, which both refuse a NUL byte by throwing.
export const PathText = z
  .string()
  .min(1)
  .refine((path) => !path.includes('\0'), 'must not contain a NUL byte')

export const AddRepoRequest = z.object({
  path: PathText,
  name: RepoName.optional(),
})
export const RemoveRepoRequest = z.object({ root: PathText })
export const RenameRepoRequest = z.object({ root: PathText, name: RepoName })
export const ScanRequest = z.object({ folder: PathText })

// ~ and ~/... as a shell would read them; anything else resolved against the cwd.
export function expandHome(path: string, home = homedir()): string {
  if (path === '~') return home
  if (path.startsWith('~/')) return join(home, path.slice(2))
  return resolve(path)
}

function done(message: string): ActionResult {
  return { ok: true, message, log: null }
}

function unchangeable(problem: string): ActionResult {
  return failure(
    `${problem}. Fix it or move it aside: the monitor won't overwrite it.`,
  )
}

// Edits run one at a time, so two that overlap can't each write the list they read and lose the
// other's change.
let lastEdit: Promise<unknown> = Promise.resolve()
export function oneAtATime<T>(edit: () => Promise<T>): Promise<T> {
  const next = lastEdit.then(edit, edit)
  lastEdit = next.catch(() => {})
  return next
}

// The list with `repos` in place of what it held, or why it couldn't be written.
function save(
  settings: string,
  list: RepoList,
  repos: TrackedRepo[],
): string | null {
  try {
    writeSettings(settings, { ...list.settings, repos })
    return null
  } catch (error) {
    return `Couldn't write ${settings}: ${errorMessage(error)}`
  }
}

// The one listed under root, as given or with its symlinks resolved.
export function listedAt(
  repos: TrackedRepo[],
  root: string,
): TrackedRepo | undefined {
  const resolved = canonical(root)
  return repos.find((repo) => repo.root === root || repo.root === resolved)
}

// Any path inside a checkout stands for its repo, which is listed by its primary checkout.
export function addRepo(
  { settings, seed }: Tracking,
  request: z.output<typeof AddRepoRequest>,
): Promise<ActionResult> {
  return oneAtATime(async () => {
    const list = readRepoList(settings, seed)
    if ('problem' in list) return unchangeable(list.problem)
    const given = expandHome(request.path)
    if (!existsSync(given)) return failure(`${given} doesn't exist`)
    const found = await findRepo(given)
    if ('error' in found) return failure(found.error)
    let root: string
    try {
      root = await primaryRoot(found.root)
    } catch (error) {
      return failure(errorMessage(error))
    }
    const listed = listedAt(list.repos, root)
    if (listed !== undefined) {
      return done(`${listed.name} (${root}) is already in the list`)
    }
    const name = request.name ?? basename(root).slice(0, MAX_NAME)
    const problem = save(settings, list, [...list.repos, { root, name }])
    return problem === null ? done(`Added ${name} (${root})`) : failure(problem)
  })
}

// Only the list changes: nothing on disk is touched.
export function removeRepo(
  { settings, seed }: Tracking,
  { root }: z.output<typeof RemoveRepoRequest>,
): Promise<ActionResult> {
  return oneAtATime(async () => {
    const list = readRepoList(settings, seed)
    if ('problem' in list) return unchangeable(list.problem)
    const listed = listedAt(list.repos, root)
    if (listed === undefined) return failure(`${root} isn't in the list`)
    const problem = save(
      settings,
      list,
      list.repos.filter((repo) => repo !== listed),
    )
    return problem === null
      ? done(`Stopped tracking ${listed.name}. Nothing on disk changed.`)
      : failure(problem)
  })
}

export function renameRepo(
  { settings, seed }: Tracking,
  { root, name }: z.output<typeof RenameRepoRequest>,
): Promise<ActionResult> {
  return oneAtATime(async () => {
    const list = readRepoList(settings, seed)
    if ('problem' in list) return unchangeable(list.problem)
    const listed = listedAt(list.repos, root)
    if (listed === undefined) return failure(`${root} isn't in the list`)
    const problem = save(
      settings,
      list,
      list.repos.map((repo) => (repo === listed ? { ...repo, name } : repo)),
    )
    return problem === null
      ? done(`Renamed ${listed.name} to ${name}`)
      : failure(problem)
  })
}

// Where a tracked repo's config is looked for: its personal file first, and STACK_MONITOR_CONFIG
// only for the repo the monitor was started for.
export function configWhere(
  { settings, seed }: Tracking,
  root: string,
): Where & { personal: string } {
  return {
    primary: root,
    personal: personalConfigPath(settings, root),
    seed: root === seed,
  }
}

export function loadRepoConfig(tracking: Tracking, root: string): LoadedConfig {
  return loadConfig(configWhere(tracking, root))
}

// The config the repo has now, and which modules it turns on.
export function readConfigStatus(
  tracking: Tracking,
  root: string,
): ConfigStatus {
  const loaded = loadRepoConfig(tracking, root)
  return loaded.ok
    ? {
        ok: true,
        repo: root,
        source: loaded.path,
        modules: modulesOf(loaded.config),
      }
    : { ok: false, repo: root, source: loaded.path, problem: loaded.problem }
}

async function readRepoStatus(
  tracking: Tracking,
  { root, name }: TrackedRepo,
): Promise<RepoStatus> {
  const problem = await whyUnreadable(root)
  return problem === null
    ? { root, name, config: readConfigStatus(tracking, root), problem: null }
    : { root, name, config: null, problem }
}

export async function readRepoStatuses(
  tracking: Tracking,
): Promise<{ repos: RepoStatus[] } | { problem: string }> {
  const list = readRepoList(tracking.settings, tracking.seed)
  if ('problem' in list) return list
  return {
    repos: await Promise.all(
      list.repos.map((repo) => readRepoStatus(tracking, repo)),
    ),
  }
}
