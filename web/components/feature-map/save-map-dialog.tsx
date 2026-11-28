import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { mapName, MapName, MapTitle } from '../../../core/feature-map/schema.ts'
import { Button } from '@/components/ui/button.tsx'
import { Checkbox } from '@/components/ui/checkbox.tsx'
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
import type { NoArgCallback } from '@/lib/callbacks.ts'

const saveMapFormSchema = z.object({
  title: MapTitle,
  name: MapName,
  starter: z.boolean(),
})

type SaveMapFormValues = z.infer<typeof saveMapFormSchema>

interface SaveMapDialogProps {
  open: boolean
  draftName: string | null // the file the map was opened from; null: not saved yet
  title: string
  starter: boolean
  folder: string // featureMap.maps
  onSave: (values: SaveMapFormValues) => Promise<void> // rejects when it was refused
  onClose: NoArgCallback
}

export function SaveMapDialog({
  open,
  draftName,
  title,
  starter,
  folder,
  onSave,
  onClose,
}: SaveMapDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <SaveMapForm
            draftName={draftName}
            title={title}
            starter={starter}
            folder={folder}
            onSave={onSave}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface SaveMapFormProps {
  draftName: string | null
  title: string
  starter: boolean
  folder: string
  onSave: (values: SaveMapFormValues) => Promise<void>
  onDone: NoArgCallback
}

// A map's title, the file it's saved to, and whether New offers it as a starter. A new map's file
// name follows its title until the file name itself is typed in.
function SaveMapForm({
  draftName,
  title,
  starter,
  folder,
  onSave,
  onDone,
}: SaveMapFormProps) {
  const form = useForm<SaveMapFormValues>({
    resolver: zodResolver(saveMapFormSchema),
    defaultValues: {
      title,
      name: draftName ?? mapName(title),
      starter,
    },
  })
  const { isSubmitting, isDirty } = form.formState
  const [follows, setFollows] = useState(draftName === null)
  const name = useWatch({ control: form.control, name: 'name' })

  const onSubmit = async (values: SaveMapFormValues) => {
    try {
      await onSave(values)
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
          {draftName === null ? 'Save map' : 'Map details'}
        </DialogTitle>
        <DialogDescription>
          Saved as a file in the repo, for you to commit.
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
              placeholder="Guest checkout"
              aria-invalid={fieldState.invalid}
              onChange={(event) => {
                field.onChange(event)
                if (follows) {
                  form.setValue('name', mapName(event.target.value))
                }
              }}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="name"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>File name</FieldLabel>
            <Input
              {...field}
              id={field.name}
              autoComplete="off"
              spellCheck={false}
              placeholder="guest-checkout"
              aria-invalid={fieldState.invalid}
              onChange={(event) => {
                setFollows(false)
                field.onChange(event)
              }}
            />
            <FieldDescription>
              {folder}/{name === '' ? '…' : name}.json
              {draftName !== null &&
                ' Changing it renames the file; a link to the old name stops working.'}
            </FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="starter"
        render={({ field }) => (
          <Field orientation="horizontal">
            <Checkbox
              id={field.name}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
            <FieldLabel htmlFor={field.name}>
              Offer it under New from starter
            </FieldLabel>
          </Field>
        )}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || (draftName !== null && !isDirty)}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
