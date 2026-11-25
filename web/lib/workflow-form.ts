import { z } from 'zod'

import { AGENT_IDS } from '../../core/config/schema.ts'
import type { Workflow } from '../../core/types.ts'

// The workflow editor's form. 'default' stands for the machine's default agent (null in the file).
export const workflowFormSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-z][a-z0-9-]{0,47}$/,
      'Lowercase letters, digits and -, starting with a letter',
    ),
  description: z.string().trim().min(1, 'One line on what it’s for'),
  permissions: z.enum(['read', 'edit', 'full']),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'A short name for the step'),
        agent: z.enum(['default', ...AGENT_IDS]),
        model: z.string(),
        prompt: z.string().trim().min(10, 'Tell the agent what this step does'),
      }),
    )
    .min(1)
    .max(4),
})

export type WorkflowFormValues = z.infer<typeof workflowFormSchema>
export type StepValues = WorkflowFormValues['steps'][number]

export function blankStep(at: number): StepValues {
  return { title: `Step ${at + 1}`, agent: 'default', model: '', prompt: '' }
}

export function formFromWorkflow(
  workflow: Workflow | null,
): WorkflowFormValues {
  if (workflow === null) {
    return {
      name: '',
      description: '',
      permissions: 'edit',
      steps: [blankStep(0)],
    }
  }
  return {
    name: workflow.name,
    description: workflow.description,
    permissions: workflow.permissions,
    steps: workflow.steps.map((step) => ({
      title: step.title,
      agent: step.agent ?? 'default',
      model: step.model ?? '',
      prompt: step.prompt,
    })),
  }
}

export function workflowFromForm(values: WorkflowFormValues): Workflow {
  return {
    name: values.name,
    description: values.description.trim(),
    permissions: values.permissions,
    steps: values.steps.map((step) => ({
      title: step.title.trim(),
      agent: step.agent === 'default' ? null : step.agent,
      model: step.model.trim() || null,
      prompt: step.prompt.trim(),
    })),
  }
}
