import { Plus } from 'lucide-react'
import { useState } from 'react'

import { countOf } from '../../../core/board/schema.ts'
import type { BoardLabel, BoardProject } from '../../../core/types.ts'
import { BoardLabelPill } from '@/components/board/board-label-pill.tsx'
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog.tsx'
import { LabelForm } from '@/components/board/label-form.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { useLabelMutations } from '@/hooks/use-label-mutations.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'

interface LabelsDialogProps {
  open: boolean
  project: BoardProject
  labels: BoardLabel[] // the shared ones, then the project's
  onClose: NoArgCallback
}

interface LabelGroupProps {
  heading: string
  empty: string
  labels: BoardLabel[]
  onEdit: (label: BoardLabel) => void
  onDelete: (label: BoardLabel) => void
}

function LabelGroup({
  heading,
  empty,
  labels,
  onEdit,
  onDelete,
}: LabelGroupProps) {
  return (
    <section aria-label={heading} className="flex flex-col gap-1">
      <h3 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {heading}
      </h3>
      {labels.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {labels.map((label) => (
            <li key={label.id} className="flex items-center gap-2 py-1.5">
              <BoardLabelPill label={label} />
              <span className="mr-auto text-xs text-muted-foreground tabular-nums">
                {countOf(label.uses, 'ticket')}
              </span>
              <Button variant="ghost" size="xs" onClick={() => onEdit(label)}>
                Edit
              </Button>
              <Button variant="ghost" size="xs" onClick={() => onDelete(label)}>
                Delete…
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// The labels this project's tickets can carry: the shared ones and its own.
export function LabelsDialog({
  open,
  project,
  labels,
  onClose,
}: LabelsDialogProps) {
  const { deleteLabel } = useLabelMutations()
  const [editing, setEditing] = useState<BoardLabel | 'new' | null>(null)
  const [deleting, setDeleting] = useState<BoardLabel | null>(null)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Labels</DialogTitle>
          <DialogDescription>
            A shared label can go on any project's tickets; the others are{' '}
            {project.name}'s alone.
          </DialogDescription>
        </DialogHeader>
        <LabelGroup
          heading="Shared"
          empty="No shared labels yet."
          labels={labels.filter((label) => label.project === null)}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
        <LabelGroup
          heading={project.name}
          empty={`${project.name} has no labels of its own yet.`}
          labels={labels.filter((label) => label.project !== null)}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
        {editing === null ? (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => setEditing('new')}
          >
            <Plus />
            New label
          </Button>
        ) : (
          <LabelForm
            key={editing === 'new' ? 'new' : editing.id}
            project={project}
            label={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
        <ConfirmDeleteDialog
          question={
            deleting === null
              ? null
              : {
                  title: `Delete ${deleting.name}?`,
                  description:
                    deleting.uses === 0
                      ? 'No ticket carries it.'
                      : `It comes off ${countOf(deleting.uses, 'ticket')}${deleting.project === null ? ', in every project' : ''}.`,
                  confirmLabel: 'Delete label',
                }
          }
          onConfirm={() =>
            deleting === null ? Promise.resolve() : deleteLabel(deleting.id)
          }
          onClose={() => setDeleting(null)}
        />
      </DialogContent>
    </Dialog>
  )
}
