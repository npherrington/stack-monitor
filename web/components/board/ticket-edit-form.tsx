import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Description, Title } from '../../../core/board/schema.ts'
import type { TicketDetail } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Field, FieldError, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Markdown } from '@/components/ui/markdown.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useTicketMutations } from '@/hooks/use-ticket-mutations.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

const ticketEditFormSchema = z.object({
  title: Title,
  description: Description,
})

type TicketEditFormValues = z.infer<typeof ticketEditFormSchema>

interface TicketEditFormProps {
  ticket: TicketDetail
}

// A ticket's title and description: read as markdown, with an Edit that swaps in the form.
export function TicketEditForm({ ticket }: TicketEditFormProps) {
  const [editing, setEditing] = useState(false)
  if (editing)
    return <Editor ticket={ticket} onDone={() => setEditing(false)} />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-lg font-semibold break-words text-strong">
          {ticket.title}
        </h3>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil />
          Edit
        </Button>
      </div>
      {ticket.description.trim() === '' ? (
        <p className="text-sm text-muted-foreground">No description.</p>
      ) : (
        <Markdown text={ticket.description} />
      )}
    </div>
  )
}

interface EditorProps {
  ticket: TicketDetail
  onDone: NoArgCallback
}

// Its values are the ticket's as the form opened: a refetch while typing doesn't replace them.
function Editor({ ticket, onDone }: EditorProps) {
  const { editTicket } = useTicketMutations()
  const form = useForm<TicketEditFormValues>({
    resolver: zodResolver(ticketEditFormSchema),
    defaultValues: { title: ticket.title, description: ticket.description },
  })
  const { isSubmitting, isDirty, dirtyFields } = form.formState

  const onSubmit = async (values: TicketEditFormValues) => {
    try {
      // Only what was changed here: the server keeps the rest as it is now, so a description
      // another tab rewrote survives a title fixed in this one.
      await editTicket({
        id: ticket.id,
        ...(dirtyFields.title ? { title: values.title } : {}),
        ...(dirtyFields.description ? { description: values.description } : {}),
      })
    } catch {
      // The toast says why; the form keeps what was typed.
      return
    }
    onDone()
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-3"
    >
      <Controller
        control={form.control}
        name="title"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Title</FieldLabel>
            <Input
              {...field}
              id={field.name}
              autoComplete="off"
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="description"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Description</FieldLabel>
            <Textarea
              {...field}
              id={field.name}
              rows={8}
              placeholder="Markdown welcome"
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDone()}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
