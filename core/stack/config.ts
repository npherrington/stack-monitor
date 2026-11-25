// A repo's stack as Settings → Stack edits it: read from the config in effect, as written, and
// saved to this machine's personal file for the repo.
import { z } from 'zod'

import { PathText } from '../repos.ts'
import {
  readRepoSection,
  saveRepoSection,
  type SaveOutcome,
  type Unlisted,
} from '../config/sections.ts'
import type { StackInput } from '../config/schema.ts'
import type { Tracking } from '../settings.ts'
import type { RepoStack } from '../types.ts'

// The stack is checked as part of the whole config it lands in, so here it only has to be an
// object: needs loops and {index} rules depend on the rest.
export const SaveStackRequest = z.object({
  root: PathText,
  stack: z.record(z.string(), z.unknown()).nullable(),
})

export function readRepoStack(
  tracking: Tracking,
  given: string,
): RepoStack | Unlisted {
  const read = readRepoSection(tracking, given, 'stack')
  if (!('root' in read)) return read
  const { value, ...rest } = read
  return {
    ...rest,
    stack: value === undefined ? null : (value as StackInput),
  }
}

// null removes the stack.
export function saveRepoStack(
  tracking: Tracking,
  { root, stack }: z.output<typeof SaveStackRequest>,
): Promise<SaveOutcome> {
  return saveRepoSection(tracking, {
    root,
    section: 'stack',
    value: stack ?? undefined,
    label: 'the stack',
  })
}
