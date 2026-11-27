import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import type { PullDetail, ReviewEvent } from '../../../core/types.ts'
import { Segmented } from '@/components/stack/segmented.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useReviewMutations } from '@/hooks/use-review-mutations.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

const reviewFormSchema = z.object({
  event: z.enum(['COMMENT', 'APPROVE', 'REQUEST_CHANGES']),
  body: z.string().trim().max(60_000),
})

type ReviewFormValues = z.infer<typeof reviewFormSchema>

const EVENTS: { value: ReviewEvent; label: string }[] = [
  { value: 'COMMENT', label: 'Comment' },
  { value: 'APPROVE', label: 'Approve' },
  { value: 'REQUEST_CHANGES', label: 'Request changes' },
]

interface ReviewPanelProps {
  root: string
  pull: PullDetail
}

// Sends the review: the verdict, a summary, and every line comment in the pending review at once.
export function ReviewPanel({ root, pull }: ReviewPanelProps) {
  const { submit } = useReviewMutations(root, pull.number)
  const own = pull.author === pull.viewer
  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: { event: 'COMMENT', body: '' },
  })
  const { isSubmitting } = form.formState

  const send = async ({ event, body }: ReviewFormValues) => {
    try {
      await submit(event, body)
    } catch (failure) {
      toastFailure("Couldn't submit the review", failure as Error)
      return
    }
    form.reset()
  }

  return (
    <Card className="gap-4 px-4 py-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-strong">Your review</h2>
        <p className="text-xs text-muted-foreground">
          {pull.pendingComments === 0
            ? 'No line comments yet: hover a line in the diff and press + to add one.'
            : `${pull.pendingComments} pending ${pull.pendingComments === 1 ? 'comment' : 'comments'} go with it. They're a draft on GitHub until you submit.`}
        </p>
      </div>
      <form
        noValidate
        onSubmit={form.handleSubmit(send)}
        className="flex flex-col gap-3"
      >
        <Controller
          control={form.control}
          name="event"
          render={({ field }) => (
            <Segmented
              label="Verdict"
              options={own ? EVENTS.slice(0, 1) : EVENTS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {own && (
          <p className="text-xs text-muted-foreground">
            It's your PR, so GitHub takes a comment only.
          </p>
        )}
        <Controller
          control={form.control}
          name="body"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Summary</FieldLabel>
              <Textarea
                {...field}
                id={field.name}
                rows={4}
                placeholder="Markdown welcome"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                Optional for an approval, or when there are line comments.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Button type="submit" className="self-end" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit review'}
        </Button>
      </form>
    </Card>
  )
}
