import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { AGENT_IDS } from '../../../core/config/schema.ts'
import { Permissions, Prompt } from '../../../core/fields.ts'
import type {
  AgentChoice,
  AgentsOverview,
  ClaudeWorkflow,
  StartRunRequest,
} from '../../../core/types.ts'
import { AgentPicker } from '@/components/agents/agent-picker.tsx'
import { PermissionsPicker } from '@/components/agents/permissions-picker.tsx'
import { WorkflowChoices } from '@/components/checkouts/workflow-choices.tsx'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Field, FieldError, FieldLabel } from '@/components/ui/field.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useStartRun, useStartTask } from '@/hooks/use-runs.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

const runPromptFormSchema = z.object({
  prompt: Prompt,
  agent: z.object({ agent: z.enum(AGENT_IDS), model: z.string().nullable() }),
  permissions: Permissions,
})

type RunPromptFormValues = z.infer<typeof runPromptFormSchema>

export interface RunHereTarget {
  root: string
  checkout: string
}

interface RunHereDialogProps {
  target: RunHereTarget | null // open while set
  overview: AgentsOverview | null
  onClose: NoArgCallback
  onStarted: (runId: string) => void
  onRunClaude: (workflow: ClaudeWorkflow) => void
}

type Mode = 'prompt' | 'workflow'

const MODES: { value: Mode; label: string }[] = [
  { value: 'prompt', label: 'Prompt' },
  { value: 'workflow', label: 'Workflow' },
]

// Starts a headless agent in one checkout with a prompt, or one of the repo's workflows. Runs
// spend money, so they only start from the page, never from the MCP server.
export function RunHereDialog({
  target,
  overview,
  onClose,
  onStarted,
  onRunClaude,
}: RunHereDialogProps) {
  const checkout = target?.checkout ?? null
  const { start, isStarting: isStartingWorkflow } = useStartRun()
  const { startTask, isStarting: isStartingTask } = useStartTask()
  const isStarting = isStartingWorkflow || isStartingTask
  const [mode, setMode] = useState<Mode>('prompt')
  // What the prompt form held when the dialog last closed: closing it loses nothing typed.
  const [kept, setKept] = useState<RunPromptFormValues | null>(null)
  const fallback: AgentChoice | null =
    overview?.default === null || overview === null
      ? null
      : {
          agent: overview.default,
          model:
            overview.agents.find((agent) => agent.id === overview.default)
              ?.model ?? null,
        }

  const runSaved = async (name: string) => {
    if (checkout === null) return
    try {
      onStarted(await start('/api/workflows/run', { checkout, name }))
    } catch {
      // The start's toast says why.
    }
  }

  return (
    <Dialog
      open={checkout !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run an agent here</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs">
            {checkout}
          </DialogDescription>
        </DialogHeader>
        <Segmented
          label="Run"
          options={MODES}
          value={mode}
          onChange={setMode}
        />
        {mode === 'workflow' && target !== null && (
          <WorkflowChoices
            root={target.root}
            isStarting={isStarting}
            onRunSaved={runSaved}
            onRunClaude={onRunClaude}
          />
        )}
        {overview !== null && fallback !== null ? (
          // Kept while the workflows show, so a prompt typed before switching is still there.
          <div hidden={mode !== 'prompt'}>
            <RunPromptForm
              checkout={checkout}
              overview={overview}
              initial={
                kept ?? { prompt: '', agent: fallback, permissions: 'edit' }
              }
              isStarting={isStarting}
              startTask={startTask}
              onKeep={setKept}
              onStarted={onStarted}
              onCancel={onClose}
            />
          </div>
        ) : (
          mode === 'prompt' && (
            <p className="text-sm text-destructive">
              No agent CLI is installed. Settings → Agents says how to add one.
            </p>
          )
        )}
        {/* The prompt form has its own Cancel beside Start run. */}
        {(mode === 'workflow' || fallback === null) && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onClose()}>
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface RunPromptFormProps {
  checkout: string | null // null while the dialog closes
  overview: AgentsOverview
  initial: RunPromptFormValues // what it held last time, or the default agent and an empty prompt
  isStarting: boolean // a run is starting from either tab
  startTask: (request: StartRunRequest) => Promise<string>
  onKeep: (values: RunPromptFormValues) => void // handed what it holds as it goes
  onStarted: (runId: string) => void
  onCancel: NoArgCallback
}

function RunPromptForm({
  checkout,
  overview,
  initial,
  isStarting,
  startTask,
  onKeep,
  onStarted,
  onCancel,
}: RunPromptFormProps) {
  const form = useForm<RunPromptFormValues>({
    resolver: zodResolver(runPromptFormSchema),
    defaultValues: initial,
  })
  const { isSubmitting } = form.formState
  // The dialog unmounts its content when it closes, and this form with it.
  useEffect(() => () => onKeep(form.getValues()), [form, onKeep])

  const onSubmit = async ({
    prompt,
    agent,
    permissions,
  }: RunPromptFormValues) => {
    if (checkout === null) return
    let runId: string
    try {
      runId = await startTask({
        checkout,
        permissions,
        title: prompt.split('\n')[0].slice(0, 80),
        steps: [{ ...agent, prompt }],
      })
    } catch {
      // The start's toast says why; the form stays as it was.
      return
    }
    // The agent and the permissions stay as picked for the next run; the prompt is done with.
    form.reset({ prompt: '', agent, permissions })
    onStarted(runId)
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
    >
      <Controller
        control={form.control}
        name="prompt"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>What should it do?</FieldLabel>
            <Textarea
              {...field}
              id={field.name}
              rows={6}
              placeholder="Fix the failing test in tests/checkouts.test.ts and explain the cause."
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="agent"
        render={({ field }) => (
          <AgentPicker
            overview={overview}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={form.control}
        name="permissions"
        render={({ field }) => (
          <PermissionsPicker value={field.value} onChange={field.onChange} />
        )}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onCancel()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || isStarting}>
          {isSubmitting || isStarting ? 'Starting…' : 'Start run'}
        </Button>
      </DialogFooter>
    </form>
  )
}
