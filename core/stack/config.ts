// A repo's stack as Settings → Stack edits it: read from the config in effect, as written, and
// saved to this machine's personal file for the repo.
import { z } from 'zod'

import {
  configCandidates,
  describeIssues,
  readRawConfig,
} from '../config/load.ts'
import { ConfigSchema, type StackInput } from '../config/schema.ts'
import { configWhere, listedAt, oneAtATime, PathText } from '../repos.ts'
import {
  readRepoList,
  writeJsonFile,
  type TrackedRepo,
  type Tracking,
} from '../settings.ts'
import {
  errorMessage,
  failure,
  type ActionResult,
  type RepoStack,
} from '../types.ts'

export const RepoRootRequest = z.object({ root: PathText })
// The stack is checked as part of the whole config it lands in, so here it only has to be an
// object: needs loops and {index} rules depend on the rest.
export const SaveStackRequest = z.object({
  root: PathText,
  stack: z.record(z.string(), z.unknown()).nullable(),
})

export type Unlisted = { problem: string } | { refused: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// The tracked repo given names, as the list has it; or why there isn't one.
export function trackedRepo(
  { settings, seed }: Tracking,
  given: string,
): TrackedRepo | Unlisted {
  const list = readRepoList(settings, seed)
  if ('problem' in list) return list
  return (
    listedAt(list.repos, given) ?? { refused: `${given} isn't in the list` }
  )
}

export function readRepoStack(
  tracking: Tracking,
  given: string,
): RepoStack | Unlisted {
  const repo = trackedRepo(tracking, given)
  if (!('root' in repo)) return repo
  const where = configWhere(tracking, repo.root)
  const read = readRawConfig(where)
  if (!read.ok) return { refused: read.problem }
  const { stack } = isObject(read.raw) ? read.raw : {}
  return {
    root: repo.root,
    stack: stack === undefined ? null : (stack as StackInput),
    source: read.path,
    personal: where.personal,
    editable: read.path === null || read.path === where.personal,
  }
}

// invalid: the config the stack would make doesn't pass the schema, a 400 rather than a refusal.
export type SaveOutcome = ActionResult | { invalid: string }

// Writes the personal file, which then wins over the repo's own. The first save copies the rest of
// the config in effect into it, so mainline and worktrees carry over; $schema stays behind, being
// a path relative to the file it was in.
export function saveRepoStack(
  tracking: Tracking,
  { root: given, stack }: z.output<typeof SaveStackRequest>,
): Promise<SaveOutcome> {
  return oneAtATime(async () => {
    const repo = trackedRepo(tracking, given)
    if ('problem' in repo) return failure(repo.problem)
    if ('refused' in repo) return failure(repo.refused)
    const where = configWhere(tracking, repo.root)
    const { personal } = where
    const read = readRawConfig(where)
    if (!configCandidates(where).some(({ path }) => path === personal)) {
      return failure(
        `STACK_MONITOR_CONFIG names ${read.path} for this repo, so a stack saved to ${personal} wouldn't be read. Edit that file, or unset it.`,
      )
    }
    if (!read.ok) {
      return failure(
        `${read.problem}. Fix it or move it aside: the monitor won't overwrite it.`,
      )
    }
    if (!isObject(read.raw)) {
      return failure(`${read.path} isn't a JSON object. Fix it first.`)
    }
    const copied = read.path !== null && read.path !== personal
    const kept = { ...read.raw }
    delete kept.stack
    if (copied) delete kept.$schema
    const next = stack === null ? kept : { ...kept, stack }
    const parsed = ConfigSchema.safeParse(next)
    if (!parsed.success) return { invalid: describeIssues(parsed.error.issues) }
    try {
      writeJsonFile(personal, next)
    } catch (error) {
      return failure(`Couldn't write ${personal}: ${errorMessage(error)}`)
    }
    const did =
      stack === null
        ? `Removed the stack from ${personal}`
        : `Saved the stack to ${personal}`
    return {
      ok: true,
      message: copied ? `${did}, with the rest of ${read.path}` : did,
      log: null,
    }
  })
}
