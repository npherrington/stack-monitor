import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button.tsx'
import { Field, FieldError, FieldLabel } from '@/components/ui/field.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import type { NoArgCallback } from '@/lib/callbacks.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

const commentFormSchema = z.object({
  body: z.string().trim().min(1, 'Write something first').max(60_000),
})

type CommentFormValues = z.infer<typeof commentFormSchema>

interface CommentFormProps {
  label: string // the field's label, read out: "Comment on line 12"
  submitLabel: string
  failureTitle: string
  onSubmit: (body: string) => Promise<unknown>
  onDone?: NoArgCallback // after a send went through, or on Cancel
}

// A markdown comment: a line comment or a reply. A refusal is a toast, and what was typed stays.
export function CommentForm({
  label,
  submitLabel,
  failureTitle,
  onSubmit,
  onDone,
}: CommentFormProps) {
  const form = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { body: '' },
  })
  const { isSubmitting } = form.formState

  const send = async ({ body }: CommentFormValues) => {
    try {
      await onSubmit(body)
    } catch (failure) {
      toastFailure(failureTitle, failure as Error)
      return
    }
    form.reset()
    onDone?.()
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(send)}
      className="flex flex-col gap-2"
    >
      <Controller
        control={form.control}
        name="body"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name} className="sr-only">
              {label}
            </FieldLabel>
            <Textarea
              {...field}
              id={field.name}
              rows={3}
              placeholder="Markdown welcome"
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <div className="flex justify-end gap-2">
        {onDone !== undefined && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDone()}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
