import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.tsx'
import type { NoArgCallback } from '@/lib/callbacks.ts'

export interface DeleteQuestion {
  title: string // "Delete BEANS-12?"
  description: string // what goes with it
  confirmLabel: string
}

interface ConfirmDeleteDialogProps {
  question: DeleteQuestion | null // open while set
  onConfirm: () => Promise<unknown> // rejects when the delete failed
  onClose: NoArgCallback
}

// The question before a project, a ticket, a label or a comment is deleted for good.
export function ConfirmDeleteDialog({
  question,
  onConfirm,
  onClose,
}: ConfirmDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const confirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
      onClose()
    } catch {
      // The toast says why, and the question stays up to try again.
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog
      open={question !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        {question !== null && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{question.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {question.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={() => void confirm()}
              >
                {isDeleting ? 'Deleting…' : question.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
