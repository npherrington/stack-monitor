// Saved workflows: .agents/workflows/<name>.json in a repo's primary checkout, one to four steps
// the monitor runs in order in one checkout. Read as data, so listing them runs nothing.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { describeIssues } from '../config/load.ts'
import { Name } from '../config/schema.ts'
import { oneAtATime, PathText } from '../repos.ts'
import { writeJsonFile } from '../settings.ts'
import {
  errorMessage,
  failure,
  type ActionResult,
  type AgentId,
  type StartRunRequest,
  type Workflow,
  type WorkflowList,
} from '../types.ts'
import { MAX_STEPS, PermissionsSchema, Prompt } from './runs.ts'
import { AgentIdSchema, ModelName } from './settings.ts'

export const WORKFLOWS_DIR = '.agents/workflows'

const WorkflowStepSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  agent: AgentIdSchema.nullable(),
  model: ModelName.nullable(),
  prompt: Prompt,
})

export const WorkflowSchema = z.strictObject({
  name: Name,
  description: z.string().trim().max(1000),
  permissions: PermissionsSchema,
  steps: z.array(WorkflowStepSchema).min(1).max(MAX_STEPS),
}) satisfies z.ZodType<Workflow>

export const WorkflowsRequest = z.object({ root: PathText })

export const SaveWorkflowRequest = z.strictObject({
  root: PathText,
  workflow: WorkflowSchema,
  replacing: Name.optional(), // the name it's saved under now, when editing one
})

export const DeleteWorkflowRequest = z.strictObject({
  root: PathText,
  name: Name,
})

export const RunWorkflowRequest = z.strictObject({
  checkout: PathText,
  name: Name,
})

function workflowsDir(root: string): string {
  return join(root, WORKFLOWS_DIR)
}

function fileOf(root: string, name: string): string {
  return join(workflowsDir(root), `${name}.json`)
}

function readWorkflowFile(
  root: string,
  file: string,
): Workflow | { problem: string } {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(join(workflowsDir(root), file), 'utf8'))
  } catch (error) {
    return { problem: `isn't readable JSON: ${errorMessage(error)}` }
  }
  const parsed = WorkflowSchema.safeParse(raw)
  if (!parsed.success) return { problem: describeIssues(parsed.error.issues) }
  const stem = file.slice(0, -'.json'.length)
  return parsed.data.name === stem
    ? parsed.data
    : { problem: `its name is ${parsed.data.name}, but the file is ${file}` }
}

export function listWorkflows(root: string): WorkflowList {
  let files: string[]
  try {
    files = readdirSync(workflowsDir(root)).filter((file) =>
      file.endsWith('.json'),
    )
  } catch {
    return { workflows: [], problems: [] }
  }
  const list: WorkflowList = { workflows: [], problems: [] }
  for (const file of files.toSorted()) {
    const read = readWorkflowFile(root, file)
    if ('problem' in read) {
      list.problems.push({
        file: `${WORKFLOWS_DIR}/${file}`,
        problem: read.problem,
      })
    } else {
      list.workflows.push(read)
    }
  }
  return list
}

export function readWorkflow(root: string, name: string): Workflow | null {
  const read = readWorkflowFile(root, `${name}.json`)
  return 'problem' in read ? null : read
}

function exists(root: string, name: string): boolean {
  return existsSync(fileOf(root, name))
}

// A new name may not land on another workflow; replacing names the one being edited, which a
// rename removes once the new file is written.
export function saveWorkflow(
  root: string,
  workflow: Workflow,
  replacing?: string,
): Promise<ActionResult> {
  return oneAtATime(async () => {
    const parsed = WorkflowSchema.safeParse(workflow)
    if (!parsed.success) return failure(describeIssues(parsed.error.issues))
    const { name } = parsed.data
    if (replacing !== undefined && !Name.safeParse(replacing).success) {
      return failure(`${replacing} isn't a workflow name`)
    }
    if (replacing !== undefined && !exists(root, replacing)) {
      return failure(`There's no workflow ${replacing} to replace`)
    }
    if (name !== replacing && exists(root, name)) {
      return failure(`A workflow named ${name} already exists`)
    }
    try {
      writeJsonFile(fileOf(root, name), parsed.data)
      if (replacing !== undefined && replacing !== name) {
        rmSync(fileOf(root, replacing), { force: true })
      }
    } catch (error) {
      return failure(`Couldn't save ${name}: ${errorMessage(error)}`)
    }
    const renamed =
      replacing !== undefined && replacing !== name
        ? ` (renamed from ${replacing})`
        : ''
    return {
      ok: true,
      message: `Saved ${WORKFLOWS_DIR}/${name}.json${renamed}`,
      log: null,
    }
  })
}

export function deleteWorkflow(
  root: string,
  name: string,
): Promise<ActionResult> {
  return oneAtATime(async () => {
    if (!Name.safeParse(name).success) {
      return failure(`${name} isn't a workflow name`)
    }
    if (!exists(root, name)) return failure(`There's no workflow ${name}`)
    try {
      rmSync(fileOf(root, name))
    } catch (error) {
      return failure(`Couldn't delete ${name}: ${errorMessage(error)}`)
    }
    return {
      ok: true,
      message: `Deleted ${WORKFLOWS_DIR}/${name}.json`,
      log: null,
    }
  })
}

// The run a workflow makes in checkout; a step with no agent takes the machine's default.
export function workflowRun(
  workflow: Workflow,
  checkout: string,
  machineDefault: AgentId | null,
): StartRunRequest | { refused: string } {
  const steps = []
  for (const step of workflow.steps) {
    const agent = step.agent ?? machineDefault
    if (agent === null) {
      return {
        refused: `"${step.title}" names no agent, and there's no default: install one, or pick one in the workflow`,
      }
    }
    steps.push({
      agent,
      model: step.model,
      prompt: step.prompt,
      title: step.title,
    })
  }
  return {
    checkout,
    title: workflow.name,
    permissions: workflow.permissions,
    steps,
  }
}
