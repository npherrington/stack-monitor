import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Colour, ShortName } from '../../../core/board/schema.ts'
import type { BoardColumn } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { Field, FieldError, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { SwatchPicker } from '@/components/ui/swatch-picker.tsx'
import { useColumnMutations } from '@/hooks/use-column-mutations.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

const columnFormSchema = z.object({ name: ShortName, colour: Colour })

type ColumnFormValues = z.infer<typeof columnFormSchema>

interface ColumnDialogProps {
  project: number
  target: BoardColumn | 'new' | null // open while set
  onClose: NoArgCallback
}

// Adds a column after the last, or renames and recolours one.
export function ColumnDialog({ project, target, onClose }: ColumnDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target !== null && (
          <ColumnForm
            key={target === 'new' ? 'new' : target.id}
            project={project}
            column={target === 'new' ? null : target}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface ColumnFormProps {
  project: number
  column: BoardColumn | null
  onDone: NoArgCallback
}

function ColumnForm({ project, column, onDone }: ColumnFormProps) {
  const { saveColumn } = useColumnMutations()
  const form = useForm<ColumnFormValues>({
    resolver: zodResolver(columnFormSchema),
    defaultValues: { name: column?.name ?? '', colour: column?.colour ?? null },
  })
  const { isSubmitting, isDirty } = form.formState

  const onSubmit = async (values: ColumnFormValues) => {
    try {
      await saveColumn({ id: column?.id, project, ...values })
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
        <DialogTitle>
          {column === null ? 'New column' : 'Edit column'}
        </DialogTitle>
      </DialogHeader>
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Name</FieldLabel>
            <Input
              {...field}
              id={field.name}
              autoComplete="off"
              placeholder="In QA"
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="colour"
        render={({ field }) => (
          <Field>
            <FieldLabel>Colour</FieldLabel>
            <SwatchPicker
              label="Colour"
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
        <Button
          type="submit"
          disabled={isSubmitting || (column !== null && !isDirty)}
        >
          {isSubmitting ? 'Saving…' : column === null ? 'Add column' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
