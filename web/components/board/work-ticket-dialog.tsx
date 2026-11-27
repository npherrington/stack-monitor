import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { BranchName } from '../../../core/fields.ts'
import type {
  BoardProject,
  RepoCheckouts,
  SkillInfo,
  TicketSummary,
} from '../../../core/types.ts'
import { CheckoutPicker } from '@/components/agents/checkout-picker.tsx'
import { SkillSelect } from '@/components/agents/skill-select.tsx'
import { SessionRepo } from '@/components/board/session-repo.tsx'
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
import { Input } from '@/components/ui/input.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { useBoardFlow } from '@/hooks/use-board-flow.ts'
import { useSkills } from '@/hooks/use-skills.ts'
import { ticketBranch } from '@/lib/board-branch.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

const skill = z.string().nullable()

// branch is only read for a new worktree, and path only for a checkout the repo already has.
const workTicketFormSchema = z.discriminatedUnion('where', [
  z.object({
    where: z.literal('new'),
    branch: BranchName,
    path: z.string(),
    skill,
  }),
  z.object({
    where: z.literal('existing'),
    branch: z.string(),
    path: z.string().min(1, 'Pick a checkout'),
    skill,
  }),
])

type WorkTicketFormValues = z.infer<typeof workTicketFormSchema>

const WHERE: { value: WorkTicketFormValues['where']; label: string }[] = [
  { value: 'new', label: 'New worktree' },
  { value: 'existing', label: 'A checkout I pick' },
]

const WORK_SKILL = 'work-ticket'

type WorkedTicket = Pick<TicketSummary, 'number' | 'key' | 'title'>

interface WorkTicketDialogProps {
  project: BoardProject
  ticket: WorkedTicket | null // open while set
  onClose: NoArgCallback
}

// Starts a Claude Code session on one ticket: in a new worktree on a branch named for it, or a
// checkout the user picks, with the board's tools so the agent reads the ticket, moves it and
// comments on it.
export function WorkTicketDialog({
  project,
  ticket,
  onClose,
}: WorkTicketDialogProps) {
  return (
    <Dialog open={ticket !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {ticket !== null && (
          <>
            <DialogHeader>
              <DialogTitle>Work {ticket.key}</DialogTitle>
              <DialogDescription>{ticket.title}</DialogDescription>
            </DialogHeader>
            <SessionRepo project={project.id}>
              {(repo) => (
                <WorkTicketSkills
                  key={repo.root}
                  project={project}
                  ticket={ticket}
                  repo={repo}
                  onDone={onClose}
                />
              )}
            </SessionRepo>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface WorkTicketSkillsProps {
  project: BoardProject
  ticket: WorkedTicket
  repo: RepoCheckouts
  onDone: NoArgCallback
}

// Holds the form back until the repo's skills have answered, so its default skill is right from
// the start.
function WorkTicketSkills({
  project,
  ticket,
  repo,
  onDone,
}: WorkTicketSkillsProps) {
  const { skills, isPending, error } = useSkills(repo.root)
  if (isPending) return <Skeleton className="h-48" />
  return (
    <>
      {error !== null && (
        <p role="alert" className="text-xs text-destructive">
          Couldn't read this repo's skills: {error.message}
        </p>
      )}
      <WorkTicketForm
        project={project}
        ticket={ticket}
        repo={repo}
        skills={skills}
        onDone={onDone}
      />
    </>
  )
}

interface WorkTicketFormProps extends WorkTicketSkillsProps {
  skills: SkillInfo[]
}

function WorkTicketForm({
  project,
  ticket,
  repo,
  skills,
  onDone,
}: WorkTicketFormProps) {
  const { workTicket } = useBoardFlow()
  const form = useForm<WorkTicketFormValues>({
    resolver: zodResolver(workTicketFormSchema),
    defaultValues: {
      where: 'new',
      branch: ticketBranch(ticket.key, ticket.title),
      path: repo.checkouts[0].path,
      skill: skills.some((each) => each.name === WORK_SKILL)
        ? WORK_SKILL
        : null,
    },
  })
  const { isSubmitting } = form.formState
  const where = useWatch({ control: form.control, name: 'where' })

  const onSubmit = async (values: WorkTicketFormValues) => {
    try {
      await workTicket({
        project: project.id,
        number: ticket.number,
        root: repo.root,
        where:
          values.where === 'new'
            ? { kind: 'new', branch: values.branch }
            : { kind: 'existing', path: values.path },
        skill: values.skill,
      })
    } catch {
      // The toast says why; the form keeps what was chosen.
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
          <Segmented
            label="Where to work"
            options={WHERE}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {where === 'new' ? (
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
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                A new branch and worktree in {repo.name}, made the way New
                worktree makes one.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      ) : (
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
      <p className="text-xs text-muted-foreground">
        Claude Code opens in a terminal tab with the board's tools. It reads the
        ticket, moves it and comments on it without asking; anything else asks
        as usual.
      </p>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Setting up…' : 'Start session'}
        </Button>
      </DialogFooter>
    </form>
  )
}
