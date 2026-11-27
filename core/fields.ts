// Rules for text a person types that a route checks too: a form imports them, so the page and
// the server can't disagree about what's valid. Imports nothing from Node, so the page can.
import { z } from 'zod'

// Only characters that mean nothing to a shell, since the name goes into the repo's own command
// as written. git check-ref-format has the last word on the rest.
export const BranchName = z
  .string()
  .trim()
  .min(1, 'Name the branch')
  .max(120)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
    'must start with a letter or digit and hold only letters, digits and . _ / -',
  )

// Four of them fit the server's 64 KB body cap.
export const MAX_PROMPT = 12_000
export const Prompt = z
  .string()
  .trim()
  .min(1, 'Say what it should do')
  .max(MAX_PROMPT, 'Keep it under 12,000 characters')

// What a headless run may do without asking: look, edit files, or anything.
export const Permissions = z.enum(['read', 'edit', 'full'])

// What a review should look at hardest: a sentence or two, not a second prompt.
export const MAX_FOCUS = 2000
export const Focus = z
  .string()
  .trim()
  .max(MAX_FOCUS, 'Keep it under 2,000 characters')
