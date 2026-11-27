import { useState } from 'react'

import { countOf } from '../../../core/board/schema.ts'
import type { BoardColumn } from '../../../core/types.ts'
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
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { useColumnMutations } from '@/hooks/use-column-mutations.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

interface DeleteColumnDialogProps {
  column: BoardColumn | null // open while set
  columns: BoardColumn[] // the project's, this one among them
  hasArchived: boolean // the project has archived tickets, which may sit in this column
  onClose: NoArgCallback
}

export function DeleteColumnDialog({
  column,
  columns,
  hasArchived,
  onClose,
}: DeleteColumnDialogProps) {
  return (
    <AlertDialog
      open={column !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        {column !== null && (
          <Question
            key={column.id}
            column={column}
            others={columns.filter((each) => each.id !== column.id)}
            hasArchived={hasArchived}
            onClose={onClose}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface QuestionProps {
  column: BoardColumn
  others: BoardColumn[]
  hasArchived: boolean
  onClose: NoArgCallback
}

// A column's tickets, archived ones included, have to go somewhere before it does.
function Question({ column, others, hasArchived, onClose }: QuestionProps) {
  const { deleteColumn } = useColumnMutations()
  const [moveTo, setMoveTo] = useState(String(others[0]?.id ?? ''))
  const [isDeleting, setIsDeleting] = useState(false)
  const onBoard = column.tickets.length
  const needsTarget = onBoard > 0 || hasArchived
  const items = others.map((each) => ({
    value: String(each.id),
    label: each.name,
  }))

  const remove = async () => {
    setIsDeleting(true)
    try {
      await deleteColumn({
        id: column.id,
        moveTo: needsTarget && moveTo !== '' ? Number(moveTo) : undefined,
      })
      onClose()
    } catch {
      // The toast says why, and the question stays up.
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {column.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          {others.length === 0
            ? "It's the project's last column, and a project keeps at least one."
            : onBoard > 0
              ? `It has ${countOf(onBoard, 'ticket')} on the board. They move to the column you choose, after its own, with any archived tickets it holds.`
              : needsTarget
                ? 'It has no tickets on the board. Any archived tickets it holds move to the column you choose.'
                : 'It has no tickets.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {needsTarget && others.length > 0 && (
        <Field>
          <FieldLabel htmlFor="delete-column-target">
            Move its tickets to
          </FieldLabel>
          <Select
            items={items}
            value={moveTo}
            onValueChange={(value) => value !== null && setMoveTo(value)}
          >
            <SelectTrigger id="delete-column-target" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          disabled={isDeleting || others.length === 0}
          onClick={() => void remove()}
        >
          {isDeleting ? 'Deleting…' : 'Delete column'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
