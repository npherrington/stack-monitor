// The runs the Agentic tab starts for you: drafting a skill, improving a piece of text, and a saved
// workflow. Each is an ordinary run of startRun with a prompt the monitor writes.
import { lstatSync } from 'node:fs'
import { join } from 'node:path'

import type { z } from 'zod'

import type { Tracking } from '../settings.ts'
import {
  failure,
  type AgentChoice,
  type AgentId,
  type StartRunResult,
} from '../types.ts'
import { designerDefault, machineDefault, readAgents } from './detect.ts'
import { readAgentSettings } from './settings.ts'
import {
  DraftSkillRequest,
  ImprovePromptRequest,
  improvePrompt,
  skillDraftPrompt,
  skillExists,
} from './skills.ts'
import { repoOfCheckout, startRun, type RunOptions } from './runs.ts'
import { readWorkflow, RunWorkflowRequest, workflowRun } from './workflows.ts'

function refused(message: string): StartRunResult {
  return { ...failure(message), runId: null }
}

// The agent asked for, else the designer: the settings' choice or a free OpenCode model.
async function designer(
  tracking: Tracking,
  asked: { agent?: AgentId; model?: string | null },
  env: NodeJS.ProcessEnv,
): Promise<AgentChoice | { refused: string }> {
  if (asked.agent !== undefined) {
    return { agent: asked.agent, model: asked.model ?? null }
  }
  const settings = readAgentSettings(tracking.settings)
  if ('problem' in settings) return { refused: settings.problem }
  return (
    designerDefault(settings, await readAgents(settings, env)) ?? {
      refused:
        'There is no agent to draft with. Install OpenCode for its free models, or choose a designer in the agent settings.',
    }
  )
}

function present(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

export async function draftSkill(
  tracking: Tracking,
  request: z.output<typeof DraftSkillRequest>,
  options: RunOptions = {},
): Promise<StartRunResult> {
  const repo = await repoOfCheckout(tracking, request.checkout)
  if ('refused' in repo) return refused(repo.refused)
  if (skillExists(repo.checkout, request.name)) {
    return refused(`${request.name} is already a skill in ${repo.checkout}`)
  }
  const choice = await designer(tracking, request, options.env ?? process.env)
  if ('refused' in choice) return refused(choice.refused)
  const claudeDir = join(repo.checkout, '.claude')
  const prompt = skillDraftPrompt({
    name: request.name,
    purpose: request.purpose,
    triggers: request.triggers,
    linkClaude: present(claudeDir) && !present(join(claudeDir, 'skills')),
  })
  return startRun(
    tracking,
    {
      checkout: repo.checkout,
      title: `Draft the ${request.name} skill`,
      permissions: 'edit',
      steps: [{ ...choice, prompt }],
    },
    'skill',
    options,
  )
}

export async function improveText(
  tracking: Tracking,
  request: z.output<typeof ImprovePromptRequest>,
  options: RunOptions = {},
): Promise<StartRunResult> {
  const choice = await designer(tracking, request, options.env ?? process.env)
  if ('refused' in choice) return refused(choice.refused)
  return startRun(
    tracking,
    {
      checkout: request.checkout,
      title: request.kind === 'skill' ? 'Improve a skill' : 'Improve a step',
      permissions: 'read',
      steps: [{ ...choice, prompt: improvePrompt(request.kind, request.text) }],
    },
    'draft',
    options,
  )
}

// The workflow is read from the repo's primary checkout and run in the checkout given.
export async function runWorkflow(
  tracking: Tracking,
  { checkout, name }: z.output<typeof RunWorkflowRequest>,
  options: RunOptions = {},
): Promise<StartRunResult> {
  const repo = await repoOfCheckout(tracking, checkout)
  if ('refused' in repo) return refused(repo.refused)
  const workflow = readWorkflow(repo.root, name)
  if (workflow === null) {
    return refused(`There's no readable workflow ${name} in ${repo.root}`)
  }
  const settings = readAgentSettings(tracking.settings)
  if ('problem' in settings) return refused(settings.problem)
  const fallback = workflow.steps.every((step) => step.agent !== null)
    ? null
    : machineDefault(settings, await readAgents(settings, options.env))
  const request = workflowRun(workflow, repo.checkout, fallback)
  if ('refused' in request) return refused(request.refused)
  return startRun(tracking, request, 'workflow', options)
}
