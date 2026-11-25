import { zodResolver } from '@hookform/resolvers/zod'
import { Sparkles } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import type {
  DetectedWorktreeCommand,
  RepoWorktrees,
  WorktreeCommandRole,
} from '../../../core/types.ts'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import { useRepoWorktrees } from '@/hooks/use-repo-worktrees.ts'
import { useWorktreeDetect } from '@/hooks/use-worktree-detect.ts'
import { toastFailure } from '@/lib/toast-failure.ts'
import {
  formFromWorktrees,
  worktreesFormSchema,
  worktreesFromForm,
  type WorktreesFormValues,
} from '@/lib/worktrees-form.ts'

type CommandField = Exclude<keyof WorktreesFormValues, 'mode'>

const FIELDS: Record<
  CommandField,
  { label: string; placeholder: string; description: string }
> = {
  create: {
    label: 'Command that makes a worktree',
    placeholder: 'mise run worktree -- {branch}',
    description:
      'Runs in the primary checkout. {branch} is the branch the new worktree goes on.',
  },
  setup: {
    label: 'Setup (optional)',
    placeholder: 'mise run setup-worktree',
    description:
      'Runs inside the new worktree after git worktree add: env files, ports. A failure takes the worktree back.',
  },
  install: {
    label: 'Install (optional)',
    placeholder: 'npm ci',
    description: 'Installs dependencies, in the background once setup is done.',
  },
  teardown: {
    label: 'Teardown (optional)',
    placeholder: 'docker compose down --volumes',
    description:
      'Runs before the worktree is removed: its containers and data. A failure stops the removal.',
  },
}

interface WorktreesEditorProps {
  repoWorktrees: RepoWorktrees
}

export function WorktreesEditor({ repoWorktrees }: WorktreesEditorProps) {
  const { root } = repoWorktrees
  const { saveWorktrees } = useRepoWorktrees(root)
  const { detected, isDetecting, error, detect } = useWorktreeDetect(root)
  const form = useForm<WorktreesFormValues>({
    resolver: zodResolver(worktreesFormSchema),
    defaultValues: formFromWorktrees(repoWorktrees.worktrees),
  })
  const mode = useWatch({ control: form.control, name: 'mode' })
  const { isSubmitting, isDirty } = form.formState

  const onSubmit = async (values: WorktreesFormValues) => {
    try {
      await saveWorktrees(worktreesFromForm(values, repoWorktrees.worktrees))
      form.reset(values)
    } catch (failure) {
      form.setError('root', { message: (failure as Error).message })
      toastFailure("Couldn't save how worktrees are made", failure as Error)
    }
  }

  // A suggestion fills its field, and a create command switches the mode to match.
  const use = (suggestion: DetectedWorktreeCommand) => {
    if (suggestion.role === 'create') {
      form.setValue('mode', 'command', { shouldDirty: true })
    }
    if (suggestion.role === 'setup' || suggestion.role === 'install') {
      form.setValue('mode', 'monitor', { shouldDirty: true })
    }
    form.setValue(suggestion.role, suggestion.command, {
      shouldDirty: true,
      shouldValidate: true,
    })
  }

  const field = (name: CommandField) => (
    <Controller
      key={name}
      control={form.control}
      name={name}
      render={({ field: input, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={input.name}>{FIELDS[name].label}</FieldLabel>
          <Input
            {...input}
            id={input.name}
            autoComplete="off"
            spellCheck={false}
            placeholder={FIELDS[name].placeholder}
            aria-invalid={fieldState.invalid}
            className="font-mono"
          />
          <FieldDescription>{FIELDS[name].description}</FieldDescription>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )

  const shown: CommandField[] =
    mode === 'command'
      ? ['create', 'teardown']
      : ['setup', 'install', 'teardown']

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
    >
      <Card className="gap-5 px-6 py-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-strong">
            A new worktree is made by
          </p>
          <Controller
            control={form.control}
            name="mode"
            render={({ field: input }) => (
              <Segmented
                label="A new worktree is made by"
                options={[
                  { value: 'monitor', label: 'The monitor: git worktree add' },
                  { value: 'command', label: 'A command of the repo’s' },
                ]}
                value={input.value}
                onChange={input.onChange}
              />
            )}
          />
          <p className="text-sm text-muted-foreground">
            {mode === 'monitor'
              ? 'Beside the primary checkout, on a branch you name or a new one cut from mainline, then setup and install.'
              : 'Your CLI makes the whole worktree: the branch, the folder, its env and its dependencies.'}
          </p>
        </div>
        {shown.map(field)}
      </Card>

      <div className="flex flex-col gap-3 rounded-2xl border border-dashed bg-card/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Read the repo’s mise tasks, package.json, scripts/, Makefile,
            justfile and lockfiles for commands to use.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={detect}
            disabled={isDetecting}
          >
            <Sparkles />
            {isDetecting
              ? 'Looking…'
              : detected === null
                ? 'Detect'
                : 'Detect again'}
          </Button>
        </div>
        {error !== null && (
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
        )}
        {detected !== null && detected.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing found to suggest.
          </p>
        )}
        {detected !== null && detected.length > 0 && (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {detected.map((suggestion) => (
              <li
                key={`${suggestion.role}:${suggestion.command}`}
                className="flex items-start gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Pill tone="highlight">{ROLE_WORDS[suggestion.role]}</Pill>
                    <Pill>{suggestion.from}</Pill>
                  </p>
                  <p className="mt-1 truncate font-mono text-sm text-strong">
                    {suggestion.command}
                  </p>
                  {suggestion.note !== null && (
                    <p className="text-xs text-warning">{suggestion.note}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => use(suggestion)}
                >
                  Use
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {form.formState.errors.root?.message !== undefined && (
        <p
          className="text-sm whitespace-pre-wrap text-destructive"
          role="alert"
        >
          {form.formState.errors.root.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          disabled={isSubmitting || (!isDirty && repoWorktrees.editable)}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Saves to <span className="font-mono">{repoWorktrees.personal}</span>
        </p>
      </div>
    </form>
  )
}

const ROLE_WORDS: Record<WorktreeCommandRole, string> = {
  create: 'makes a worktree',
  setup: 'setup',
  install: 'install',
  teardown: 'teardown',
}
