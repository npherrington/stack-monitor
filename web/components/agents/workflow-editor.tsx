import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  Controller,
  useFieldArray,
  useForm,
  type Control,
} from 'react-hook-form'

import type { AgentsOverview, Workflow } from '../../../core/types.ts'
import { PermissionsPicker } from '@/components/agents/permissions-picker.tsx'
import { RunLogDialog } from '@/components/agents/run-log-dialog.tsx'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import { Field, FieldError, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useStartRun } from '@/hooks/use-runs.ts'
import { useWorkflows } from '@/hooks/use-workflows.ts'
import {
  blankStep,
  formFromWorkflow,
  workflowFormSchema,
  workflowFromForm,
  type WorkflowFormValues,
} from '@/lib/workflow-form.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

interface WorkflowEditorProps {
  root: string
  checkout: string | undefined // where a prompt improvement runs (read only)
  overview: AgentsOverview | null
  editing: Workflow | null // null: a new one
  onDone: () => void
}

export function WorkflowEditor({
  root,
  checkout,
  overview,
  editing,
  onDone,
}: WorkflowEditorProps) {
  const { saveWorkflow } = useWorkflows(root)
  const { start } = useStartRun()
  const [improving, setImproving] = useState<{
    step: number
    runId: string
  } | null>(null)
  const form = useForm<WorkflowFormValues>({
    resolver: zodResolver(workflowFormSchema),
    defaultValues: formFromWorkflow(editing),
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'steps',
  })
  const { isSubmitting } = form.formState

  const onSubmit = async (values: WorkflowFormValues) => {
    try {
      await saveWorkflow(workflowFromForm(values), editing?.name ?? null)
      onDone()
    } catch (failure) {
      form.setError('root', { message: (failure as Error).message })
      toastFailure("Couldn't save the workflow", failure as Error)
    }
  }

  // The designer rewrites one step's prompt in a read-only run; its report can replace the prompt.
  const improve = async (step: number) => {
    const text = form.getValues(`steps.${step}.prompt`)
    if (checkout === undefined || text.trim() === '') return
    try {
      const runId = await start('/api/prompts/improve', {
        checkout,
        kind: 'step',
        text,
        agent: overview?.designer?.agent,
        model: overview?.designer?.model ?? undefined,
      })
      setImproving({ step, runId })
    } catch {
      // The start's toast says why.
    }
  }

  const agentOptions = [
    { value: 'default' as const, label: 'Default' },
    ...(overview?.agents ?? [])
      .filter((agent) => agent.installed)
      .map((agent) => ({ value: agent.id, label: agent.label })),
  ]

  return (
    <Card className="gap-4 px-6 py-6">
      <h2 className="text-lg font-semibold text-strong">
        {editing === null ? 'New workflow' : `Edit ${editing.name}`}
      </h2>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <TextField control={form.control} name="name" label="Name" mono />
          <TextField
            control={form.control}
            name="description"
            label="What it’s for"
          />
        </div>
        <Controller
          control={form.control}
          name="permissions"
          render={({ field }) => (
            <PermissionsPicker value={field.value} onChange={field.onChange} />
          )}
        />
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="flex flex-col gap-3 rounded-2xl border bg-card/60 p-4"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-40 flex-1">
                <TextField
                  control={form.control}
                  name={`steps.${index}.title`}
                  label={`Step ${index + 1}`}
                />
              </div>
              <Controller
                control={form.control}
                name={`steps.${index}.agent`}
                render={({ field: agent }) => (
                  <Segmented
                    label="Agent"
                    options={agentOptions}
                    value={agent.value}
                    onChange={agent.onChange}
                  />
                )}
              />
              <div className="w-56">
                <TextField
                  control={form.control}
                  name={`steps.${index}.model`}
                  label="Model (optional)"
                  mono
                />
              </div>
              {fields.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  aria-label={`Remove step ${index + 1}`}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <Controller
              control={form.control}
              name={`steps.${index}.prompt`}
              render={({ field: prompt, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`step-prompt-${index}`}>
                    Prompt
                  </FieldLabel>
                  <Textarea
                    {...prompt}
                    id={`step-prompt-${index}`}
                    rows={5}
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => improve(index)}
              disabled={overview?.designer === null || checkout === undefined}
            >
              <Sparkles />
              Improve with the designer
            </Button>
          </div>
        ))}
        {form.formState.errors.root?.message !== undefined && (
          <p
            className="text-sm whitespace-pre-wrap text-destructive"
            role="alert"
          >
            {form.formState.errors.root.message}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {fields.length < 4 && (
            <Button
              variant="outline"
              onClick={() => append(blankStep(fields.length))}
            >
              <Plus />
              Add a step
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save workflow'}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
      <RunLogDialog
        runId={improving?.runId ?? null}
        onClose={() => setImproving(null)}
        onUseReport={(report) => {
          if (improving !== null) {
            form.setValue(`steps.${improving.step}.prompt`, report.trim(), {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          setImproving(null)
        }}
      />
    </Card>
  )
}

function TextField({
  control,
  name,
  label,
  mono = false,
}: {
  control: Control<WorkflowFormValues>
  name:
    'name' | 'description' | `steps.${number}.title` | `steps.${number}.model`
  label: string
  mono?: boolean
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`wf-${field.name}`}>{label}</FieldLabel>
          <Input
            {...field}
            id={`wf-${field.name}`}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={fieldState.invalid}
            className={mono ? 'font-mono' : undefined}
          />
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )
}
