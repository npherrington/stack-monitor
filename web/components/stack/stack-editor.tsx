import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

import type { RepoStack } from '../../../core/types.ts'
import { DetectPanel } from '@/components/stack/detect-panel.tsx'
import { ServiceFields } from '@/components/stack/service-fields.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useRepoStack } from '@/hooks/use-repo-stack.ts'
import {
  blankRow,
  rowFromService,
  stackFormSchema,
  stackFromRows,
  type StackFormValues,
} from '@/lib/stack-form.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

interface StackEditorProps {
  repoStack: RepoStack
}

function rowsOf(repoStack: RepoStack): StackFormValues {
  const services = repoStack.stack?.services ?? {}
  return {
    services: Object.entries(services).map(([name, service]) =>
      rowFromService(name, service),
    ),
  }
}

export function StackEditor({ repoStack }: StackEditorProps) {
  const { saveStack } = useRepoStack(repoStack.root)
  const form = useForm<StackFormValues>({
    resolver: zodResolver(stackFormSchema),
    defaultValues: rowsOf(repoStack),
  })
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'services',
  })
  const rows = useWatch({ control: form.control, name: 'services' })
  const names = rows.map((row) => row.name).filter(Boolean)
  const { isSubmitting, isDirty } = form.formState

  const onSubmit = async (values: StackFormValues) => {
    const stack =
      values.services.length === 0
        ? null
        : stackFromRows(values.services, repoStack.stack)
    try {
      await saveStack(stack)
      form.reset(values)
    } catch (failure) {
      form.setError('root', { message: (failure as Error).message })
      toastFailure("Couldn't save the stack", failure as Error)
    }
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
    >
      {fields.length === 0 && (
        <p className="text-muted-foreground">
          No services yet. Detect them from the repo’s files, or add one.
        </p>
      )}
      {fields.map((field, index) => (
        <ServiceFields
          key={field.id}
          control={form.control}
          index={index}
          otherNames={names.filter((name) => name !== rows[index]?.name)}
          onRemove={() => remove(index)}
        />
      ))}
      <DetectPanel
        root={repoStack.root}
        takenNames={names}
        onAdd={(detected) =>
          append(rowFromService(detected.name, detected.service))
        }
      />
      {form.formState.errors.root?.message !== undefined && (
        <p
          className="text-sm whitespace-pre-wrap text-destructive"
          role="alert"
        >
          {form.formState.errors.root.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => append(blankRow())}>
          <Plus />
          Add a service
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || (!isDirty && repoStack.editable)}
        >
          {isSubmitting ? 'Saving…' : 'Save stack'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Saves to <span className="font-mono">{repoStack.personal}</span>
        </p>
      </div>
    </form>
  )
}
