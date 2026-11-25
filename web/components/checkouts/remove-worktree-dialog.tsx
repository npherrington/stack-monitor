import { useState } from 'react'

import type { Checkout } from '../../../core/types.ts'
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
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import { useRemoveWorktree } from '@/hooks/use-remove-worktree.ts'

export interface RemoveTarget {
  root: string
  mainline: string
  checkout: Checkout
}

interface RemoveWorktreeDialogProps {
  target: RemoveTarget | null // open while set
  onClose: () => void
}

export function RemoveWorktreeDialog({
  target,
  onClose,
}: RemoveWorktreeDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {target !== null && (
          <Confirm
            key={target.checkout.path}
            target={target}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Confirm({
  target,
  onClose,
}: {
  target: RemoveTarget
  onClose: () => void
}) {
  const { removeWorktree, isRemoving } = useRemoveWorktree()
  const { checkout, mainline } = target
  const [deleteBranch, setDeleteBranch] = useState(checkout.merged)
  const [refused, setRefused] = useState<string | null>(null)

  const remove = async () => {
    setRefused(null)
    try {
      await removeWorktree({
        root: target.root,
        path: checkout.path,
        deleteBranch,
      })
      onClose()
    } catch (failure) {
      setRefused((failure as Error).message)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Remove this worktree?</DialogTitle>
        <DialogDescription
          className="truncate font-mono text-xs"
          title={checkout.path}
        >
          {checkout.path}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Runs the repo's teardown, if it has one, then{' '}
          <code>git worktree remove</code>: the folder goes, ignored files like{' '}
          <code>node_modules</code> with it. Commits stay on the branch.
        </p>
        {checkout.changed > 0 && (
          <p role="alert" className="rounded-xl bg-warning/10 p-2 text-warning">
            It has {checkout.changed} changed or untracked{' '}
            {checkout.changed === 1
              ? "file. Commit, stash or delete it, and it's ready to remove."
              : "files. Commit, stash or delete them, and it's ready to remove."}
          </p>
        )}
        {checkout.branch !== null &&
          (checkout.merged ? (
            <Field orientation="horizontal">
              <Checkbox
                id="remove-delete-branch"
                checked={deleteBranch}
                onCheckedChange={setDeleteBranch}
              />
              <FieldLabel htmlFor="remove-delete-branch">
                Also delete <span className="font-mono">{checkout.branch}</span>
                , merged into {mainline}
              </FieldLabel>
            </Field>
          ) : (
            <p className="text-muted-foreground">
              <span className="font-mono">{checkout.branch}</span> isn't merged
              into {mainline}, so it's kept.
            </p>
          ))}
        {refused !== null && (
          <p role="alert" className="text-destructive">
            {refused}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={() => void remove()}
          disabled={isRemoving || checkout.changed > 0}
        >
          {isRemoving ? 'Removing…' : 'Remove worktree'}
        </Button>
      </DialogFooter>
    </>
  )
}
