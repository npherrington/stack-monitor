// This machine's agent preferences, kept under `agents` in the settings file beside `repos`.
import { isAbsolute } from 'node:path'

import { z } from 'zod'

import { AGENT_IDS } from '../config/schema.ts'
import { describeIssues } from '../config/load.ts'
import { oneAtATime, PathText } from '../repos.ts'
import {
  readRepoList,
  readSettings,
  writeSettings,
  type Tracking,
} from '../settings.ts'
import {
  errorMessage,
  failure,
  type ActionResult,
  type AgentSettings,
} from '../types.ts'

// A model name goes into argv after --model, so it can't start with a `-` and be read as a flag.
export const ModelName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(
    /^[A-Za-z0-9][\w.:/@#+-]*$/,
    'must be a model name: letters, digits and . : / @ # + - _',
  )

export const AgentIdSchema = z.enum(AGENT_IDS)

export const AgentChoiceSchema = z.strictObject({
  agent: AgentIdSchema,
  model: ModelName.nullable(),
})

const AgentPrefs = z.strictObject({
  program: PathText.max(1024)
    .refine(isAbsolute, 'must be an absolute path')
    .optional(),
  model: ModelName.optional(),
})

export const AgentSettingsSchema = z.strictObject({
  default: AgentIdSchema.optional(),
  designer: AgentChoiceSchema.optional(),
  agents: z.partialRecord(AgentIdSchema, AgentPrefs).optional(),
}) satisfies z.ZodType<AgentSettings>

// What the settings file holds under `agents`: {} when the file or the key isn't there yet.
export function readAgentSettings(
  path: string,
): AgentSettings | { problem: string } {
  const read = readSettings(path)
  if ('problem' in read) return read
  if (!read.found || read.settings.agents === undefined) return {}
  const parsed = AgentSettingsSchema.safeParse(read.settings.agents)
  return parsed.success
    ? parsed.data
    : {
        problem: `The agents in the settings file ${path} aren't valid: ${describeIssues(parsed.error.issues)}`,
      }
}

// Replaces the whole `agents` key; repos and any other key stay as they are.
export function saveAgentSettings(
  { settings, seed }: Tracking,
  agents: AgentSettings,
): Promise<ActionResult> {
  return oneAtATime(async () => {
    const list = readRepoList(settings, seed)
    if ('problem' in list) {
      return failure(
        `${list.problem}. Fix it or move it aside: the monitor won't overwrite it.`,
      )
    }
    try {
      writeSettings(settings, { ...list.settings, agents })
    } catch (error) {
      return failure(`Couldn't write ${settings}: ${errorMessage(error)}`)
    }
    return { ok: true, message: `Saved the agent settings`, log: null }
  })
}
