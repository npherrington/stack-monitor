import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Colour, ShortName } from '../../../core/board/schema.ts'
import type { BoardLabel, BoardProject } from '../../../core/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { SwatchPicker } from '@/components/ui/swatch-picker.tsx'
import { useLabelMutations } from '@/hooks/use-label-mutations.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

const labelFormSchema = z.object({
  name: ShortName,
  colour: Colour,
  shared: z.boolean(),
})

type LabelFormValues = z.infer<typeof labelFormSchema>

interface LabelFormProps {
  project: BoardProject
  label: BoardLabel | null // the one being edited; null adds one
  onDone: NoArgCallback
}

// A label's name and colour, and for a new one whether every project gets it. That choice is
// made once: a label stays shared or with its project.
export function LabelForm({ project, label, onDone }: LabelFormProps) {
  const { saveLabel } = useLabelMutations()
  const form = useForm<LabelFormValues>({
    resolver: zodResolver(labelFormSchema),
    defaultValues: {
      name: label?.name ?? '',
      colour: label?.colour ?? null,
      shared: label === null ? false : label.project === null,
    },
  })
  const { isSubmitting, isDirty } = form.formState

  const onSubmit = async ({ name, colour, shared }: LabelFormValues) => {
    try {
      await saveLabel({
        id: label?.id,
        project: shared ? null : project.id,
        name,
        colour,
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
      className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3"
    >
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`label-${field.name}`}>
              {label === null ? 'New label' : `Rename ${label.name}`}
            </FieldLabel>
            <Input
              {...field}
              id={`label-${field.name}`}
              autoComplete="off"
              placeholder="bug"
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
      {label === null && (
        <Controller
          control={form.control}
          name="shared"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="label-shared"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <FieldLabel htmlFor="label-shared">
                Share it with every project
              </FieldLabel>
            </Field>
          )}
        />
      )}
      {label === null && (
        <FieldDescription>
          Left unticked, only {project.name} has it. This can't be changed
          later.
        </FieldDescription>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDone()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || (label !== null && !isDirty)}
        >
          {isSubmitting ? 'Saving…' : label === null ? 'Add label' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
