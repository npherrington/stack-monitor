import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'

import type { RepoCheckouts } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
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
import { useCreateWorktree } from '@/hooks/use-create-worktree.ts'
import { useRepoWorktrees } from '@/hooks/use-repo-worktrees.ts'

const newWorktreeSchema = z.object({
  branch: z.string().trim().min(1, 'Name the branch'),
})

type NewWorktreeValues = z.infer<typeof newWorktreeSchema>

interface NewWorktreeDialogProps {
  repo: RepoCheckouts | null // open while set
  onClose: () => void
}

export function NewWorktreeDialog({ repo, onClose }: NewWorktreeDialogProps) {
  return (
    <Dialog open={repo !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-xl">
        {repo !== null && <NewWorktreeForm repo={repo} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

// What Create will run, from the worktree settings in effect.
function Plan({ repo }: { repo: RepoCheckouts }) {
  const { repoWorktrees, isPending } = useRepoWorktrees(repo.root)
  if (isPending || repoWorktrees === null) return null
  const { create, setup, install } = repoWorktrees.worktrees
  const steps =
    create === undefined
      ? [
          `git worktree add -b <branch> beside ${repo.root}, from ${repo.mainline}`,
          ...(setup === undefined ? [] : [`then ${setup}`]),
          ...(install === undefined
            ? []
            : [`then ${install}, in the background`]),
        ]
      : [`${create}, in ${repo.root}`]
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">Creating runs:</p>
      <ul className="flex flex-col gap-0.5 font-mono text-xs break-all">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
      <Link
        to="/settings"
        className="text-xs text-muted-foreground underline underline-offset-2"
      >
        Change it in Settings
      </Link>
    </div>
  )
}

function NewWorktreeForm({
  repo,
  onDone,
}: {
  repo: RepoCheckouts
  onDone: () => void
}) {
  const { createWorktree } = useCreateWorktree()
  const form = useForm<NewWorktreeValues>({
    resolver: zodResolver(newWorktreeSchema),
    defaultValues: { branch: '' },
  })
  const { isSubmitting } = form.formState

  const onSubmit = async ({ branch }: NewWorktreeValues) => {
    try {
      await createWorktree({ root: repo.root, branch })
      onDone()
    } catch (failure) {
      form.setError('branch', { message: (failure as Error).message })
    }
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>New worktree</DialogTitle>
        <DialogDescription>{repo.name}</DialogDescription>
      </DialogHeader>
      <Controller
        control={form.control}
        name="branch"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Branch</FieldLabel>
            <Input
              {...field}
              id={field.name}
              autoComplete="off"
              spellCheck={false}
              placeholder="feature/login"
              aria-invalid={fieldState.invalid}
              className="font-mono"
            />
            <FieldDescription>
              A new branch, cut for this worktree.
            </FieldDescription>
            {fieldState.invalid && (
              <FieldError
                errors={[fieldState.error]}
                className="whitespace-pre-wrap break-words"
              />
            )}
          </Field>
        )}
      />
      <Plan repo={repo} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Making it…' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  )
}
