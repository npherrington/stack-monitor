// How a repo makes worktrees, as Settings edits it: the config in effect's worktrees section, as
// written, saved to this machine's personal file for the repo.
import { z } from 'zod'

import { PathText } from '../repos.ts'
import {
  readRepoSection,
  saveRepoSection,
  type SaveOutcome,
  type Unlisted,
} from '../config/sections.ts'
import type { WorktreesInput } from '../config/schema.ts'
import type { Tracking } from '../settings.ts'
import type { RepoWorktrees } from '../types.ts'

// Checked as part of the whole config it lands in: {index} in setup needs worktrees.index, and a
// stack's commands can use {index} too.
export const SaveWorktreesRequest = z.object({
  root: PathText,
  worktrees: z.record(z.string(), z.unknown()),
})

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readRepoWorktrees(
  tracking: Tracking,
  given: string,
): RepoWorktrees | Unlisted {
  const read = readRepoSection(tracking, given, 'worktrees')
  if (!('root' in read)) return read
  const { value, ...rest } = read
  return {
    ...rest,
    worktrees: isObject(value) ? (value as WorktreesInput) : {},
  }
}

// An empty object removes the section, which means the same as leaving it out.
export function saveRepoWorktrees(
  tracking: Tracking,
  { root, worktrees }: z.output<typeof SaveWorktreesRequest>,
): Promise<SaveOutcome> {
  return saveRepoSection(tracking, {
    root,
    section: 'worktrees',
    value: Object.keys(worktrees).length === 0 ? undefined : worktrees,
    label: 'the worktree settings',
  })
}
