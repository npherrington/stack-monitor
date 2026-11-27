import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { CommentBody } from '../../../core/board/schema.ts'
import { Button } from '@/components/ui/button.tsx'
import { Field, FieldError, FieldLabel } from '@/components/ui/field.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import type { NoArgCallback } from '@/lib/callbacks.ts'

const commentFormSchema = z.object({ body: CommentBody })

type CommentFormValues = z.infer<typeof commentFormSchema>

interface CommentEditorProps {
  label: string // the field's label, read out: "Add a comment"
  initial?: string // the comment being edited
  submitLabel: string
  onSubmit: (body: string) => Promise<unknown> // rejects when it wasn't saved
  onDone?: NoArgCallback // after a save went through, or on Cancel
}

// A markdown comment on a ticket, new or being edited. What was typed stays when a save fails.
export function CommentEditor({
  label,
  initial = '',
  submitLabel,
  onSubmit,
  onDone,
}: CommentEditorProps) {
  const form = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { body: initial },
  })
  const { isSubmitting, isDirty } = form.formState
  const id = useId()

  const send = async ({ body }: CommentFormValues) => {
    try {
      await onSubmit(body)
    } catch {
      // The toast says why.
      return
    }
    form.reset({ body: '' })
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
            <FieldLabel htmlFor={id} className="sr-only">
              {label}
            </FieldLabel>
            <Textarea
              {...field}
              id={id}
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
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || (initial !== '' && !isDirty)}
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
