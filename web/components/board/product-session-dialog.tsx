import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import type { BoardProject, RepoCheckouts } from '../../../core/types.ts'
import { CheckoutPicker } from '@/components/agents/checkout-picker.tsx'
import { SessionRepo } from '@/components/board/session-repo.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { FieldError } from '@/components/ui/field.tsx'
import { useBoardFlow } from '@/hooks/use-board-flow.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

const productSessionFormSchema = z.object({
  path: z.string().min(1, 'Pick a checkout'),
})

type ProductSessionFormValues = z.infer<typeof productSessionFormSchema>

interface ProductSessionDialogProps {
  open: boolean
  project: BoardProject
  onClose: NoArgCallback
}

// Starts a Claude Code session in product management mode: it interviews the user, reads the
// repo it runs in, and files tickets into this project through the board's tools.
export function ProductSessionDialog({
  open,
  project,
  onClose,
}: ProductSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Product management</DialogTitle>
          <DialogDescription>
            It interviews you, reads the code and files tickets into{' '}
            {project.name}. Creating tickets doesn't ask first; changing or
            moving one does.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <SessionRepo project={project.id}>
            {(repo) => (
              <ProductSessionForm
                key={repo.root}
                project={project}
                repo={repo}
                onDone={onClose}
              />
            )}
          </SessionRepo>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface ProductSessionFormProps {
  project: BoardProject
  repo: RepoCheckouts
  onDone: NoArgCallback
}

function ProductSessionForm({
  project,
  repo,
  onDone,
}: ProductSessionFormProps) {
  const { startProduct } = useBoardFlow()
  const form = useForm<ProductSessionFormValues>({
    resolver: zodResolver(productSessionFormSchema),
    defaultValues: { path: repo.checkouts[0].path },
  })
  const { isSubmitting } = form.formState

  const onSubmit = async ({ path }: ProductSessionFormValues) => {
    try {
      await startProduct({ project: project.id, root: repo.root, path })
    } catch {
      // The toast says why; the dialog stays for another checkout.
      return
    }
    onDone()
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
    >
      <Controller
        control={form.control}
        name="path"
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-1.5">
            <CheckoutPicker
              id={field.name}
              label="Read the code in"
              repo={repo}
              value={field.value}
              onChange={field.onChange}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </div>
        )}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Starting…' : 'Start session'}
        </Button>
      </DialogFooter>
    </form>
  )
}
