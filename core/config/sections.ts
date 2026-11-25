// One section of a tracked repo's config, as Settings edits it: read from the config in effect, as
// written, and saved to this machine's personal file for the repo.
import { z } from 'zod'

import { configWhere, listedAt, oneAtATime, PathText } from '../repos.ts'
import {
  readRepoList,
  writeJsonFile,
  type TrackedRepo,
  type Tracking,
} from '../settings.ts'
import { errorMessage, failure, type ActionResult } from '../types.ts'
import { configCandidates, describeIssues, readRawConfig } from './load.ts'
import { ConfigSchema, type ConfigInput } from './schema.ts'

export const RepoRootRequest = z.object({ root: PathText })

export type Unlisted = { problem: string } | { refused: string }

export type Section = keyof ConfigInput

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

export interface ReadSection {
  root: string
  value: unknown // undefined when the config in effect has no such section
  source: string | null // the config file it came from; null when there's none
  personal: string // the file a save writes
  editable: boolean // false when the config in effect isn't the personal file (a save copies it)
}

export function readRepoSection(
  tracking: Tracking,
  given: string,
  section: Section,
): ReadSection | Unlisted {
  const repo = trackedRepo(tracking, given)
  if (!('root' in repo)) return repo
  const where = configWhere(tracking, repo.root)
  const read = readRawConfig(where)
  if (!read.ok) return { refused: read.problem }
  return {
    root: repo.root,
    value: isObject(read.raw) ? read.raw[section] : undefined,
    source: read.path,
    personal: where.personal,
    editable: read.path === null || read.path === where.personal,
  }
}

// invalid: the config the section would make doesn't pass the schema, a 400 rather than a refusal.
export type SaveOutcome = ActionResult | { invalid: string }

export interface SectionSave {
  root: string
  section: Section
  value: unknown // undefined removes the section
  label: string // what the message calls it: "the stack"
}

// Writes the personal file, which then wins over the repo's own. The first save copies the rest of
// the config in effect into it, so the other sections carry over; $schema stays behind, being a
// path relative to the file it was in. The whole config is checked, since some rules ({index}
// needing worktrees.index, a stack's needs) reach across sections.
export function saveRepoSection(
  tracking: Tracking,
  { root: given, section, value, label }: SectionSave,
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
        `STACK_MONITOR_CONFIG names ${read.path} for this repo, so ${label} saved to ${personal} wouldn't be read. Edit that file, or unset it.`,
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
    delete kept[section]
    if (copied) delete kept.$schema
    const next = value === undefined ? kept : { ...kept, [section]: value }
    const parsed = ConfigSchema.safeParse(next)
    if (!parsed.success) return { invalid: describeIssues(parsed.error.issues) }
    try {
      writeJsonFile(personal, next)
    } catch (error) {
      return failure(`Couldn't write ${personal}: ${errorMessage(error)}`)
    }
    const did =
      value === undefined
        ? `Removed ${label} from ${personal}`
        : `Saved ${label} to ${personal}`
    return {
      ok: true,
      message: copied ? `${did}, with the rest of ${read.path}` : did,
      log: null,
    }
  })
}
