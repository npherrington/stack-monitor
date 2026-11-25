import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { nextFires, parseCron } from '../../../core/schedules/cron.ts'
import type {
  AgentId,
  AgentsOverview,
  RepoCheckouts,
  RunPermissions,
  SaveScheduleRequest,
  SaveScheduleResult,
  Schedule,
  ScheduleTask,
} from '../../../core/types.ts'
import { AgentPicker } from '@/components/agents/agent-picker.tsx'
import { CheckoutPicker } from '@/components/agents/checkout-picker.tsx'
import { PermissionsPicker } from '@/components/agents/permissions-picker.tsx'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useWorkflows } from '@/hooks/use-workflows.ts'

const PRESETS = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily 9:00', cron: '0 9 * * *' },
  { label: 'Weekdays 9:00', cron: '0 9 * * 1-5' },
  { label: 'Mondays 8:00', cron: '0 8 * * 1' },
  { label: 'Nightly 2:00', cron: '0 2 * * *' },
]

const scheduleFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name it.').max(80),
    cron: z.string().trim().min(1, 'Say when, as a cron line.'),
    root: z.string().min(1, 'Pick a repo.'),
    checkout: z.string().min(1, 'Pick a checkout.'),
    fireFrom: z.enum(['launchd', 'monitor']),
    enabled: z.boolean(),
    kind: z.enum(['prompt', 'workflow']),
    agent: z.string(),
    model: z.string(),
    prompt: z.string(),
    permissions: z.enum(['read', 'edit', 'full']),
    workflow: z.string(), // 'saved:<name>' or 'claude:<name>'
    notes: z.string().max(4000),
    argument: z.string().max(500),
    testRun: z.boolean(),
  })
  .superRefine((values, context) => {
    const cron = parseCron(values.cron)
    if ('problem' in cron) {
      context.addIssue({
        code: 'custom',
        path: ['cron'],
        message: cron.problem,
      })
    }
    if (values.kind === 'prompt' && values.prompt.trim() === '') {
      context.addIssue({
        code: 'custom',
        path: ['prompt'],
        message: 'Say what it should do.',
      })
    }
    if (values.kind === 'workflow' && values.workflow === '') {
      context.addIssue({
        code: 'custom',
        path: ['workflow'],
        message: 'Pick a workflow.',
      })
    }
  })

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>

function defaults(
  editing: Schedule | null,
  root: string,
  overview: AgentsOverview | null,
): ScheduleFormValues {
  const task = editing?.task
  return {
    name: editing?.name ?? '',
    cron: editing?.cron ?? '0 9 * * 1-5',
    root,
    checkout: editing?.checkout ?? '',
    fireFrom: editing?.fireFrom ?? 'launchd',
    enabled: editing?.enabled ?? true,
    kind: task === undefined || task.kind === 'prompt' ? 'prompt' : 'workflow',
    agent:
      task?.kind === 'prompt' ? task.agent : (overview?.default ?? 'claude'),
    model: task?.kind === 'prompt' ? (task.model ?? '') : '',
    prompt: task?.kind === 'prompt' ? task.prompt : '',
    permissions:
      (task?.kind === 'prompt' || task?.kind === 'claude'
        ? task.permissions
        : undefined) ?? 'edit',
    workflow:
      task?.kind === 'workflow'
        ? `saved:${task.name}`
        : task?.kind === 'claude'
          ? `claude:${task.name}`
          : '',
    notes: task?.kind === 'claude' ? (task.notes ?? '') : '',
    argument: task?.kind === 'claude' ? (task.argument ?? '') : '',
    testRun: task?.kind === 'claude' ? (task.testRun ?? false) : true,
  }
}

function taskOf(values: ScheduleFormValues): ScheduleTask {
  if (values.kind === 'prompt') {
    return {
      kind: 'prompt',
      agent: values.agent as AgentId,
      model: values.model.trim() === '' ? null : values.model.trim(),
      prompt: values.prompt.trim(),
      permissions: values.permissions,
    }
  }
  const [source, name] = values.workflow.split(':')
  if (source === 'saved') return { kind: 'workflow', name }
  return {
    kind: 'claude',
    name,
    testRun: values.testRun,
    ...(values.notes.trim() === '' ? {} : { notes: values.notes.trim() }),
    ...(values.argument.trim() === ''
      ? {}
      : { argument: values.argument.trim() }),
    permissions: values.permissions,
  }
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ScheduleDialogProps {
  open: boolean
  editing: Schedule | null
  repos: RepoCheckouts[]
  overview: AgentsOverview | null
  onSave: (request: SaveScheduleRequest) => Promise<SaveScheduleResult>
  onClose: () => void
}

export function ScheduleDialog(props: ScheduleDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        {props.open && (
          <ScheduleForm key={props.editing?.id ?? 'new'} {...props} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ScheduleForm({
  editing,
  repos,
  overview,
  onSave,
  onClose,
}: ScheduleDialogProps) {
  const firstRoot =
    repos.find((repo) =>
      repo.checkouts.some((checkout) => checkout.path === editing?.checkout),
    )?.root ??
    repos[0]?.root ??
    ''
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: defaults(editing, firstRoot, overview),
  })
  const { isSubmitting } = form.formState
  const [blocked, setBlocked] = useState<SaveScheduleResult | null>(null)
  // The next fires count from when the form opened.
  const [openedAt] = useState(() => new Date())
  const [cronLine, root, kind, workflow, fireFrom] = useWatch({
    control: form.control,
    name: ['cron', 'root', 'kind', 'workflow', 'fireFrom'],
  })
  const repo = repos.find((each) => each.root === root)
  const { list } = useWorkflows(root === '' ? null : root)
  const claude = workflow.startsWith('claude:')
    ? list?.claude.find((each) => `claude:${each.name}` === workflow)
    : undefined
  const parsed = parseCron(cronLine)
  const upcoming = 'problem' in parsed ? [] : nextFires(parsed, openedAt, 3)

  const onSubmit = async (values: ScheduleFormValues) => {
    const request: SaveScheduleRequest = {
      ...(editing === null ? {} : { id: editing.id }),
      name: values.name.trim(),
      cron: values.cron.trim(),
      checkout: values.checkout || (repo?.checkouts[0]?.path ?? ''),
      enabled: values.enabled,
      fireFrom: values.fireFrom,
      task: taskOf(values),
    }
    try {
      const result = await onSave(request)
      if (result.blocked !== null) {
        setBlocked(result)
        return
      }
      onClose()
    } catch (failure) {
      form.setError('root.server', { message: (failure as Error).message })
    }
  }

  const fireFromMonitor = () => {
    form.setValue('fireFrom', 'monitor')
    setBlocked(null)
    void form.handleSubmit(onSubmit)()
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
    >
      <DialogHeader>
        <DialogTitle>
          {editing === null ? 'New schedule' : `Edit ${editing.name}`}
        </DialogTitle>
        <DialogDescription>
          Starts a prompt or a workflow in one checkout on a timetable.
        </DialogDescription>
      </DialogHeader>

      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="schedule-name">Name</FieldLabel>
            <Input
              {...field}
              id="schedule-name"
              autoComplete="off"
              placeholder="Morning bug hunt"
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-strong">When</h3>
        <Controller
          control={form.control}
          name="cron"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="schedule-cron">Cron line</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.cron}
                    type="button"
                    size="xs"
                    variant={
                      field.value === preset.cron ? 'secondary' : 'outline'
                    }
                    onClick={() => field.onChange(preset.cron)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Input
                {...field}
                id="schedule-cron"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {upcoming.length > 0
                  ? `Next: ${upcoming.map((at) => when(at.toISOString())).join(' · ')}`
                  : 'minute hour day-of-month month day-of-week, in local time'}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="fireFrom"
          render={({ field }) => (
            <Field>
              <FieldLabel>Fired by</FieldLabel>
              <Segmented
                label="Fired by"
                options={[
                  { value: 'launchd', label: 'launchd' },
                  { value: 'monitor', label: 'The monitor' },
                ]}
                value={field.value}
                onChange={field.onChange}
              />
              <FieldDescription>
                {fireFrom === 'launchd'
                  ? 'A macOS LaunchAgent fires it, whether the monitor is running or not.'
                  : 'Fires only while the monitor is running. A time it misses is skipped.'}
              </FieldDescription>
            </Field>
          )}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-strong">Where</h3>
        <div className="flex flex-wrap gap-3">
          <Controller
            control={form.control}
            name="root"
            render={({ field, fieldState }) => (
              <Field
                data-invalid={fieldState.invalid}
                className="w-56 max-w-full"
              >
                <FieldLabel htmlFor="schedule-repo">Repo</FieldLabel>
                <Select
                  items={repos.map((each) => ({
                    value: each.root,
                    label: each.name,
                  }))}
                  value={field.value}
                  onValueChange={(next) => {
                    if (next === null) return
                    field.onChange(next)
                    form.setValue('checkout', '')
                    form.setValue('workflow', '')
                  }}
                >
                  <SelectTrigger id="schedule-repo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((each) => (
                      <SelectItem key={each.root} value={each.root}>
                        {each.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="checkout"
            render={({ field }) => (
              <CheckoutPicker
                repo={repo}
                value={field.value === '' ? null : field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-strong">What</h3>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Segmented
              label="What it starts"
              options={[
                { value: 'prompt', label: 'Prompt' },
                { value: 'workflow', label: 'Workflow' },
              ]}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {kind === 'prompt' ? (
          <>
            <Controller
              control={form.control}
              name="prompt"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="schedule-prompt">
                    What should it do?
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="schedule-prompt"
                    rows={4}
                    placeholder="Update the dependencies that have patch releases and open a draft PR."
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            {overview !== null && (
              <Controller
                control={form.control}
                name="agent"
                render={({ field }) => (
                  <AgentPicker
                    overview={overview}
                    value={{
                      agent: field.value as AgentId,
                      model: form.getValues('model') || null,
                    }}
                    onChange={(choice) => {
                      field.onChange(choice.agent)
                      form.setValue('model', choice.model ?? '')
                    }}
                  />
                )}
              />
            )}
            <Controller
              control={form.control}
              name="permissions"
              render={({ field }) => (
                <PermissionsPicker
                  value={field.value}
                  onChange={(next: RunPermissions) => field.onChange(next)}
                />
              )}
            />
          </>
        ) : (
          <>
            <Controller
              control={form.control}
              name="workflow"
              render={({ field, fieldState }) => {
                const items = [
                  ...(list?.claude ?? []).map((each) => ({
                    value: `claude:${each.name}`,
                    label: each.label,
                  })),
                  ...(list?.workflows ?? []).map((each) => ({
                    value: `saved:${each.name}`,
                    label: each.name,
                  })),
                ]
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="schedule-workflow">
                      Workflow
                    </FieldLabel>
                    <Select
                      items={items}
                      value={field.value === '' ? null : field.value}
                      onValueChange={(next) =>
                        next !== null && field.onChange(next)
                      }
                    >
                      <SelectTrigger id="schedule-workflow" className="w-full">
                        <SelectValue placeholder="Pick one of the repo's workflows" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {items.length === 0 && (
                      <FieldDescription>
                        This repo has no workflows yet.
                      </FieldDescription>
                    )}
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )
              }}
            />
            {claude !== undefined && (
              <>
                {claude.cost !== null && (
                  <p className="text-sm text-warning">{claude.cost}</p>
                )}
                {claude.argument !== 'none' && (
                  <Controller
                    control={form.control}
                    name="argument"
                    render={({ field }) => (
                      <Field>
                        <FieldLabel htmlFor="schedule-argument">
                          {claude.argumentLabel ?? claude.argument}
                        </FieldLabel>
                        <Input
                          {...field}
                          id="schedule-argument"
                          className="font-mono"
                        />
                      </Field>
                    )}
                  />
                )}
                <Controller
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="schedule-notes">
                        Instructions
                      </FieldLabel>
                      <Textarea
                        {...field}
                        id="schedule-notes"
                        rows={2}
                        placeholder="Optional"
                      />
                    </Field>
                  )}
                />
                {claude.testRun && (
                  <Controller
                    control={form.control}
                    name="testRun"
                    render={({ field }) => (
                      <Field orientation="horizontal">
                        <Checkbox
                          id="schedule-test-run"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <FieldLabel htmlFor="schedule-test-run">
                          Test run: drafts what it would publish, publishes
                          nothing
                        </FieldLabel>
                      </Field>
                    )}
                  />
                )}
              </>
            )}
          </>
        )}
      </section>

      <Controller
        control={form.control}
        name="enabled"
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox
              id="schedule-enabled"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <FieldLabel htmlFor="schedule-enabled">On</FieldLabel>
          </Field>
        )}
      />

      {form.formState.errors.root?.server !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {form.formState.errors.root.server.message}
        </p>
      )}

      {blocked !== null && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-2xl bg-warning/10 p-3 text-sm"
        >
          <p className="text-strong">{blocked.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={fireFromMonitor}>
              Fire it from the monitor instead
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Keep launchd, I'll give access
            </Button>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? fireFrom === 'launchd'
              ? 'Checking launchd…'
              : 'Saving…'
            : editing === null
              ? 'Add schedule'
              : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
