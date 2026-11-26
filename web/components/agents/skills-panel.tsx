import { zodResolver } from '@hookform/resolvers/zod'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import type {
  AgentChoice,
  AgentsOverview,
  RepoCheckouts,
} from '../../../core/types.ts'
import { AgentPicker } from '@/components/agents/agent-picker.tsx'
import { CheckoutPicker } from '@/components/agents/checkout-picker.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useStartRun } from '@/hooks/use-runs.ts'
import { useSkills } from '@/hooks/use-skills.ts'

const skillFormSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-z][a-z0-9-]{0,47}$/,
      'Lowercase letters, digits and -, starting with a letter',
    ),
  purpose: z
    .string()
    .trim()
    .min(10, 'Say what the skill does, in a sentence or more'),
  triggers: z.string().trim().min(5, 'When should an agent reach for it?'),
})

type SkillFormValues = z.infer<typeof skillFormSchema>

interface SkillsPanelProps {
  root: string
  repo: RepoCheckouts | undefined
  overview: AgentsOverview | null
  onOpenRun: (id: string) => void
}

export function SkillsPanel({
  root,
  repo,
  overview,
  onOpenRun,
}: SkillsPanelProps) {
  const { skills, isPending, error } = useSkills(root)
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-strong">
          Skills in this repo
        </h2>
        {isPending ? (
          <Skeleton className="h-40" />
        ) : error !== null ? (
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
        ) : skills.length === 0 ? (
          <p className="text-muted-foreground">
            None yet in .agents/skills or .claude/skills.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {skills.map((skill) => (
              <li key={skill.path} className="px-4 py-3">
                <p className="font-bold text-strong">{skill.name}</p>
                {skill.description !== null && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {skill.description}
                  </p>
                )}
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {skill.path}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <NewSkill repo={repo} overview={overview} onOpenRun={onOpenRun} />
    </div>
  )
}

function NewSkill({
  repo,
  overview,
  onOpenRun,
}: Omit<SkillsPanelProps, 'root'>) {
  const { start } = useStartRun()
  const [checkout, setCheckout] = useState<string | null>(null)
  const [designer, setDesigner] = useState<AgentChoice | null>(null)
  const choice = designer ?? overview?.designer ?? null
  const form = useForm<SkillFormValues>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: { name: '', purpose: '', triggers: '' },
  })
  const { isSubmitting } = form.formState

  const onSubmit = async (values: SkillFormValues) => {
    const where = checkout ?? repo?.checkouts[0]?.path
    if (where === undefined) return
    try {
      const runId = await start('/api/skills/draft', {
        checkout: where,
        ...values,
        agent: choice?.agent,
        model: choice?.model ?? undefined,
      })
      form.reset()
      onOpenRun(runId)
    } catch {
      // The start's toast says why.
    }
  }

  const text = (
    name: keyof SkillFormValues,
    label: string,
    description: string,
    multiline: boolean,
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`skill-${field.name}`}>{label}</FieldLabel>
          {multiline ? (
            <Textarea
              {...field}
              id={`skill-${field.name}`}
              rows={3}
              aria-invalid={fieldState.invalid}
            />
          ) : (
            <Input
              {...field}
              id={`skill-${field.name}`}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={fieldState.invalid}
              className="font-mono"
            />
          )}
          <FieldDescription>{description}</FieldDescription>
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  )

  return (
    <Card className="gap-4 px-6 py-6">
      <div>
        <h2 className="text-lg font-semibold text-strong">
          Design a new skill
        </h2>
        <p className="text-sm text-muted-foreground">
          The designer writes <code>.agents/skills/&lt;name&gt;/SKILL.md</code>{' '}
          in the checkout you pick, with a trigger-sharp description and steps
          that say when they’re done. Review it like any other change.
        </p>
      </div>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        {text(
          'name',
          'Name',
          'Becomes the folder and the skill’s name: release-notes, fix-flaky-test.',
          false,
        )}
        {text(
          'purpose',
          'What it does',
          'The job, the steps you’d want followed, what good output looks like.',
          true,
        )}
        {text(
          'triggers',
          'When to use it',
          'The requests or moments that should make an agent load it.',
          true,
        )}
        <CheckoutPicker repo={repo} value={checkout} onChange={setCheckout} />
        {overview !== null && choice !== null && (
          <AgentPicker
            overview={overview}
            value={choice}
            onChange={setDesigner}
          />
        )}
        <Button
          type="submit"
          className="self-start"
          disabled={isSubmitting || choice === null}
        >
          <Sparkles />
          {isSubmitting ? 'Starting…' : 'Draft the skill'}
        </Button>
      </form>
    </Card>
  )
}
