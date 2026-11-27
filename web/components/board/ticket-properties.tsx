import {
  PRIORITIES,
  type ProjectBoard,
  type TicketDetail,
} from '../../../core/types.ts'
import { LabelPicker } from '@/components/board/label-picker.tsx'
import { PRIORITY_LABELS } from '@/components/board/priority.ts'
import { Button } from '@/components/ui/button.tsx'
import { Field, FieldLabel } from '@/components/ui/field.tsx'
import { Input } from '@/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.tsx'
import { useTicketMutations } from '@/hooks/use-ticket-mutations.ts'

const PRIORITY_ITEMS = PRIORITIES.map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
}))

interface TicketPropertiesProps {
  ticket: TicketDetail
  board: ProjectBoard
}

// A ticket's column, priority, due date and labels. Each change is sent as it's made, and the
// control shows what the server has once it answers.
export function TicketProperties({ ticket, board }: TicketPropertiesProps) {
  const { updateTicket, moveTicket } = useTicketMutations()
  const columnItems = board.columns.map((column) => ({
    value: String(column.id),
    label: column.name,
  }))
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="ticket-column">Column</FieldLabel>
        <Select
          items={columnItems}
          value={String(ticket.column)}
          disabled={ticket.archived}
          onValueChange={(value) =>
            value !== null &&
            Number(value) !== ticket.column &&
            // To the top of the column picked.
            moveTicket({
              id: ticket.id,
              column: Number(value),
              beside: null,
              place: 'before',
            })
          }
        >
          <SelectTrigger id="ticket-column" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columnItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="ticket-priority">Priority</FieldLabel>
        <Select
          items={PRIORITY_ITEMS}
          value={ticket.priority}
          onValueChange={(value) =>
            value !== null &&
            value !== ticket.priority &&
            updateTicket({ id: ticket.id, priority: value })
          }
        >
          <SelectTrigger id="ticket-priority" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="ticket-due">
          Due
          {ticket.overdue && (
            <span className="font-semibold text-warning">Overdue</span>
          )}
        </FieldLabel>
        <div className="flex gap-1.5">
          {/* Sent when the box is left or Enter is pressed, not as it changes: a browser reports
              a whole date after each digit typed (0002-11-28 on the way to 2027-11-28). Keyed
              by the stored date so the box then shows what the server has. */}
          <Input
            key={ticket.dueOn ?? 'none'}
            id="ticket-due"
            type="date"
            defaultValue={ticket.dueOn ?? ''}
            onBlur={(event) => {
              // A date with a part missing reads as empty, which would clear the stored one.
              if (event.target.validity.badInput) return
              const dueOn =
                event.target.value === '' ? null : event.target.value
              if (dueOn !== ticket.dueOn) updateTicket({ id: ticket.id, dueOn })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
          {ticket.dueOn !== null && (
            <Button
              variant="ghost"
              onClick={() => updateTicket({ id: ticket.id, dueOn: null })}
            >
              Clear
            </Button>
          )}
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="ticket-labels">Labels</FieldLabel>
        <LabelPicker
          id="ticket-labels"
          labels={board.labels}
          value={ticket.labels.map((label) => label.id)}
          onChange={(labels) => updateTicket({ id: ticket.id, labels })}
        />
      </Field>
    </div>
  )
}
