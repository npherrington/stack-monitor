import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { Focus } from '../../../core/fields.ts'
import type {
  PullDetail,
  RepoCheckouts,
  SkillInfo,
} from '../../../core/types.ts'
import { CheckoutPicker } from '@/components/agents/checkout-picker.tsx'
import { SkillSelect } from '@/components/agents/skill-select.tsx'
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useCheckouts } from '@/hooks/use-checkouts.ts'
import { useGithubFlow } from '@/hooks/use-github-flow.ts'
import { useSkills } from '@/hooks/use-skills.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

const agenticReviewFormSchema = z
  .object({
    where: z.enum(['new', 'existing']),
    path: z.string(), // the checkout picked; only read while where is existing
    skill: z.string().nullable(),
    focus: Focus,
  })
  .refine((values) => values.where === 'new' || values.path !== '', {
    path: ['path'],
    message: 'Pick a checkout',
  })

type AgenticReviewFormValues = z.infer<typeof agenticReviewFormSchema>

const WHERE: { value: AgenticReviewFormValues['where']; label: string }[] = [
  { value: 'new', label: 'New review worktree' },
  { value: 'existing', label: 'A checkout I pick' },
]

const REVIEW_SKILL = 'peer-code-review'

function folder(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

interface AgenticReviewDialogProps {
  root: string
  pull: PullDetail
  open: boolean
  onClose: NoArgCallback
}

// Starts a Claude Code session that reviews this PR: in a worktree the monitor puts at the PR's
// head, or a checkout the user picks, with the skill to use and the PR's details in its first
// message. The agent posts the review from the terminal, after asking.
export function AgenticReviewDialog({
  root,
  pull,
  open,
  onClose,
}: AgenticReviewDialogProps) {
  const checkouts = useCheckouts()
  const {
    skills,
    isPending: skillsPending,
    error: skillsError,
  } = useSkills(open ? root : null)
  const repo = checkouts.repos.find((each) => each.root === root)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Agentic review</DialogTitle>
          <DialogDescription>
            #{pull.number} {pull.title}
            <span className="block truncate font-mono text-xs">
              {pull.branch} → {pull.base}
            </span>
          </DialogDescription>
        </DialogHeader>
        {!open ? null : checkouts.isPending || skillsPending ? (
          <Skeleton className="h-72" />
        ) : checkouts.error !== null ? (
          <p
            role="alert"
            className="text-sm whitespace-pre-wrap text-destructive"
          >
            {checkouts.error.message}
          </p>
        ) : repo === undefined || repo.checkouts.length === 0 ? (
          <p role="alert" className="text-sm text-destructive">
            {repo?.problem ?? "This repo's checkouts couldn't be read."}
          </p>
        ) : (
          <>
            {skillsError !== null && (
              <p role="alert" className="text-xs text-destructive">
                Couldn't read this repo's skills: {skillsError.message}
              </p>
            )}
            <AgenticReviewForm
              repo={repo}
              pull={pull}
              skills={skills}
              onDone={onClose}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface AgenticReviewFormProps {
  repo: RepoCheckouts
  pull: PullDetail
  skills: SkillInfo[]
  onDone: NoArgCallback
}

function AgenticReviewForm({
  repo,
  pull,
  skills,
  onDone,
}: AgenticReviewFormProps) {
  const { startAgenticReview } = useGithubFlow(repo.root, pull.number)
  // A checkout already on the PR's branch is the natural place, unless the branch is a fork's:
  // a local branch of the same name there is somebody else's.
  const onBranch = pull.crossRepository
    ? undefined
    : repo.checkouts.find((checkout) => checkout.branch === pull.branch)
  const form = useForm<AgenticReviewFormValues>({
    resolver: zodResolver(agenticReviewFormSchema),
    defaultValues: {
      where: onBranch === undefined ? 'new' : 'existing',
      path: onBranch?.path ?? repo.checkouts[0].path,
      skill: skills.some((skill) => skill.name === REVIEW_SKILL)
        ? REVIEW_SKILL
        : null,
      focus: '',
    },
  })
  const { isSubmitting } = form.formState
  const where = useWatch({ control: form.control, name: 'where' })
  const reviewPath = `${repo.root}-review-pr-${pull.number}`
  const isMade = repo.checkouts.some((checkout) => checkout.path === reviewPath)

  const onSubmit = async (values: AgenticReviewFormValues) => {
    try {
      await startAgenticReview({
        path: values.where === 'new' ? null : values.path,
        skill: values.skill,
        focus: values.focus,
      })
    } catch (failure) {
      toastFailure("Couldn't start the review", failure as Error)
      return
    }
    onDone()
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
    >
      <Controller
        control={form.control}
        name="where"
        render={({ field }) => (
          <div className="flex flex-col gap-2">
            <Segmented
              label="Where to review"
              options={WHERE}
              value={field.value}
              onChange={field.onChange}
            />
            {field.value === 'new' && (
              <p className="text-xs text-muted-foreground">
                {isMade
                  ? `Moves ${folder(reviewPath)} to the PR's latest commit.`
                  : `Makes ${folder(reviewPath)} beside the primary, at the PR's head, on no branch.`}
                {pull.crossRepository &&
                  " It's a fork's PR, so the repo's setup and install won't run there."}
              </p>
            )}
          </div>
        )}
      />
      {where === 'existing' && (
        <Controller
          control={form.control}
          name="path"
          render={({ field, fieldState }) => (
            <div className="flex flex-col gap-1.5">
              <CheckoutPicker
                id={field.name}
                label="Checkout"
                repo={repo}
                value={field.value}
                onChange={field.onChange}
              />
              <p className="text-xs text-muted-foreground">
                The monitor changes nothing in it: the skill's own step gets it
                onto the PR's branch.
              </p>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </div>
          )}
        />
      )}
      <Controller
        control={form.control}
        name="skill"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Skill</FieldLabel>
            <SkillSelect
              id={field.name}
              skills={skills}
              value={field.value}
              onChange={field.onChange}
            />
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="focus"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Focus</FieldLabel>
            <Textarea
              {...field}
              id={field.name}
              rows={3}
              placeholder="The refusals in the new route"
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>
              Optional: what to look at hardest.
            </FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <p className="text-xs text-muted-foreground">
        Claude Code reviews in a terminal tab and asks before it posts the
        review, so you read it first.
        {pull.pendingReview !== null &&
          ` You have a draft review on this PR with ${pull.pendingComments} ${pull.pendingComments === 1 ? 'comment' : 'comments'}. GitHub keeps one per person, so submit or discard it before the agent posts.`}
      </p>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Setting up…' : 'Start review'}
        </Button>
      </DialogFooter>
    </form>
  )
}
