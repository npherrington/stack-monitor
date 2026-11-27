import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import {
  Colour,
  derivePrefix,
  Prefix,
  ProjectName,
} from '../../../core/board/schema.ts'
import type { BoardProject } from '../../../core/types.ts'
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
import { SwatchPicker } from '@/components/ui/swatch-picker.tsx'
import { useBoardFlow } from '@/hooks/use-board-flow.ts'
import { useProjectMutations } from '@/hooks/use-project-mutations.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

const projectFormSchema = z.object({
  name: ProjectName,
  prefix: Prefix,
  colour: Colour,
})

type ProjectFormValues = z.infer<typeof projectFormSchema>

interface ProjectDialogProps {
  open: boolean
  project: BoardProject | null // the one being edited; null makes a new one
  onClose: NoArgCallback
}

export function ProjectDialog({ open, project, onClose }: ProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <ProjectForm
            key={project?.id ?? 'new'}
            project={project}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface ProjectFormProps {
  project: BoardProject | null
  onDone: NoArgCallback
}

function ProjectForm({ project, onDone }: ProjectFormProps) {
  const { createProject } = useBoardFlow()
  const { saveProject } = useProjectMutations()
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? '',
      prefix: project?.prefix ?? '',
      colour: project?.colour ?? null,
    },
  })
  const { isSubmitting, isDirty } = form.formState
  // A new project's prefix follows its name until the prefix itself is typed in.
  const [follows, setFollows] = useState(project === null)
  const prefix = useWatch({ control: form.control, name: 'prefix' })

  const onSubmit = async (values: ProjectFormValues) => {
    try {
      if (project === null) await createProject(values)
      else await saveProject({ id: project.id, ...values })
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
          {project === null ? 'New project' : 'Edit project'}
        </DialogTitle>
        <DialogDescription>
          A project is a board of its own, with its own columns and ticket ids.
        </DialogDescription>
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
              placeholder="Beans"
              aria-invalid={fieldState.invalid}
              onChange={(event) => {
                field.onChange(event)
                if (follows) {
                  form.setValue('prefix', derivePrefix(event.target.value))
                }
              }}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="prefix"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={field.name}>Ticket prefix</FieldLabel>
            <Input
              {...field}
              id={field.name}
              autoComplete="off"
              spellCheck={false}
              placeholder="BEANS"
              aria-invalid={fieldState.invalid}
              onChange={(event) => {
                setFollows(false)
                field.onChange(event)
              }}
            />
            <FieldDescription>
              Its tickets read {(prefix.trim() || 'BEANS').toUpperCase()}-1,{' '}
              {(prefix.trim() || 'BEANS').toUpperCase()}-2…
              {project !== null &&
                ' Changing it renames every ticket; the numbers stay.'}
            </FieldDescription>
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
          disabled={isSubmitting || (project !== null && !isDirty)}
        >
          {isSubmitting
            ? 'Saving…'
            : project === null
              ? 'Create project'
              : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
