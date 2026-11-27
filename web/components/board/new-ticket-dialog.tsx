import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  Description,
  DueOn,
  LabelIds,
  PriorityName,
  Title,
} from '../../../core/board/schema.ts'
import { PRIORITIES, type ProjectBoard } from '../../../core/types.ts'
import { LabelPicker } from '@/components/board/label-picker.tsx'
import { PRIORITY_LABELS } from '@/components/board/priority.ts'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Field, FieldError, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useTicketMutations } from '@/hooks/use-ticket-mutations.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

const newTicketFormSchema = z.object({
  title: Title,
  description: Description,
  column: z.number(),
  priority: PriorityName,
  dueOn: DueOn,
  labels: LabelIds,
})

type NewTicketFormValues = z.infer<typeof newTicketFormSchema>

const PRIORITY_ITEMS = PRIORITIES.map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
}))

interface NewTicketDialogProps {
  board: ProjectBoard
  column: number | null // the column it starts in; open while set
  onClose: NoArgCallback
}

export function NewTicketDialog({
  board,
  column,
  onClose,
}: NewTicketDialogProps) {
  return (
    <Dialog open={column !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {column !== null && (
          <NewTicketForm
            key={column}
            board={board}
            column={column}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface NewTicketFormProps {
  board: ProjectBoard
  column: number
  onDone: NoArgCallback
}

function NewTicketForm({ board, column, onDone }: NewTicketFormProps) {
  const { createTicket } = useTicketMutations()
  const form = useForm<NewTicketFormValues>({
    resolver: zodResolver(newTicketFormSchema),
    defaultValues: {
      title: '',
      description: '',
      column,
      priority: 'none',
      dueOn: null,
      labels: [],
    },
  })
  const { isSubmitting } = form.formState
  const columnItems = board.columns.map((each) => ({
    value: String(each.id),
    label: each.name,
  }))

  const onSubmit = async (values: NewTicketFormValues) => {
    try {
      await createTicket({ project: board.project.id, ...values })
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
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>New ticket</DialogTitle>
        <DialogDescription>
          {board.project.name}. It lands at the top of its column.
        </DialogDescription>
      </DialogHeader>
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
              rows={5}
              placeholder="Markdown welcome"
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Controller
          control={form.control}
          name="column"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Column</FieldLabel>
              <Select
                items={columnItems}
                value={String(field.value)}
                onValueChange={(value) =>
                  value !== null && field.onChange(Number(value))
                }
              >
                <SelectTrigger id={field.name} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columnItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="priority"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Priority</FieldLabel>
              <Select
                items={PRIORITY_ITEMS}
                value={field.value}
                onValueChange={(value) =>
                  value !== null && field.onChange(value)
                }
              >
                <SelectTrigger id={field.name} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="dueOn"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Due</FieldLabel>
              <Input
                id={field.name}
                type="date"
                name={field.name}
                ref={field.ref}
                value={field.value ?? ''}
                onBlur={field.onBlur}
                onChange={(event) =>
                  field.onChange(
                    event.target.value === '' ? null : event.target.value,
                  )
                }
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </div>
      <Controller
        control={form.control}
        name="labels"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={field.name}>Labels</FieldLabel>
            <LabelPicker
              id={field.name}
              labels={board.labels}
              value={field.value}
              onChange={field.onChange}
            />
          </Field>
        )}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create ticket'}
        </Button>
      </DialogFooter>
    </form>
  )
}
