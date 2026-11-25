import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button.tsx'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import { useRepos } from '@/hooks/use-repos.ts'

const addRepoFormSchema = z.object({
  path: z.string().trim().min(1, 'Paste the path of a checkout'),
})

type AddRepoFormValues = z.infer<typeof addRepoFormSchema>

// A path typed or pasted: the browser can't hand a folder's path to the page.
export function AddRepoForm() {
  const { addRepo } = useRepos()
  const form = useForm<AddRepoFormValues>({
    resolver: zodResolver(addRepoFormSchema),
    defaultValues: { path: '' },
  })
  const { isSubmitting } = form.formState

  const onSubmit = async ({ path }: AddRepoFormValues) => {
    try {
      await addRepo({ path })
      form.reset()
    } catch (failure) {
      // The server's refusal belongs to the field: it's about what was typed there.
      form.setError('path', { message: (failure as Error).message })
    }
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-3 sm:flex-row sm:items-start"
    >
      <Controller
        control={form.control}
        name="path"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="flex-1">
            <FieldLabel htmlFor={field.name}>Repo path</FieldLabel>
            <Input
              {...field}
              id={field.name}
              autoComplete="off"
              spellCheck={false}
              placeholder="~/code/myapp"
              aria-invalid={fieldState.invalid}
              className="font-mono"
            />
            <FieldDescription>
              Any checkout or folder inside one: a worktree adds its repo.
            </FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Button type="submit" disabled={isSubmitting} className="sm:mt-6">
        {isSubmitting ? 'Adding…' : 'Add repo'}
      </Button>
    </form>
  )
}
