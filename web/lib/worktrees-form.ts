import { z } from 'zod'

import { BRANCH, type WorktreesInput } from '../../core/config/schema.ts'

// The Worktrees editor's form. The server validates the result against the whole config ({index}
// rules); what the editor doesn't show (index) is kept from the section as loaded.

export const worktreesFormSchema = z
  .object({
    mode: z.enum(['monitor', 'command']),
    create: z.string(),
    setup: z.string(),
    install: z.string(),
    teardown: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.mode !== 'command') return
    if (values.create.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['create'],
        message: 'The command that makes a worktree',
      })
    } else if (!values.create.includes(BRANCH)) {
      ctx.addIssue({
        code: 'custom',
        path: ['create'],
        message: `Say where the branch goes with ${BRANCH}`,
      })
    }
  })

export type WorktreesFormValues = z.infer<typeof worktreesFormSchema>

export function formFromWorktrees(
  worktrees: WorktreesInput,
): WorktreesFormValues {
  return {
    mode: worktrees.create === undefined ? 'monitor' : 'command',
    create: worktrees.create ?? '',
    setup: worktrees.setup ?? '',
    install: worktrees.install ?? '',
    teardown: worktrees.teardown ?? '',
  }
}

function optional(text: string): string | undefined {
  const trimmed = text.trim()
  return trimmed === '' ? undefined : trimmed
}

// A create command makes the whole worktree, so setup and install go only with the monitor's own.
export function worktreesFromForm(
  values: WorktreesFormValues,
  loaded: WorktreesInput,
): WorktreesInput {
  const own = values.mode === 'monitor'
  return {
    index: loaded.index,
    create: own ? undefined : optional(values.create),
    setup: own ? optional(values.setup) : undefined,
    install: own ? optional(values.install) : undefined,
    teardown: optional(values.teardown),
  }
}
