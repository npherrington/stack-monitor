// What each board route takes, and the limits the forms share with it. Imports nothing from Node,
// so the page imports it too.
import { z } from 'zod'

import { BOARD_COLOURS, PRIORITIES } from '../types.ts'

export const MAX_TITLE = 200
export const MAX_DESCRIPTION = 16_000
export const MAX_COMMENT = 8_000
export const MAX_COLUMNS = 20
export const MAX_TICKET_LABELS = 20

export const DEFAULT_COLUMNS = [
  'Backlog',
  'Todo',
  'In progress',
  'In review',
  'Done',
  'Cancelled',
] as const

const Id = z.number().int().positive()
// A GET's ids arrive as text.
const QueryId = z.coerce.number().int().positive()
export const Colour = z.enum(BOARD_COLOURS).nullable()
export const ShortName = z.string().trim().min(1, 'Name it').max(40)
export const ProjectName = z.string().trim().min(1, 'Name it').max(80)
// What comes before the dash in a ticket's id: BEANS, WEB2.
export const Prefix = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9]{0,9}$/,
    'Start with a letter; up to 10 letters and digits',
  )
export const Title = z
  .string()
  .trim()
  .min(1, 'Give it a title')
  .max(MAX_TITLE)
  .regex(/^[^\r\n]*$/, 'Keep the title to one line')
export const Description = z.string().max(MAX_DESCRIPTION)
export const CommentBody = z
  .string()
  .trim()
  .min(1, 'Write something first')
  .max(MAX_COMMENT)
export const PriorityName = z.enum(PRIORITIES)
export const DueOn = z.iso.date().nullable() // YYYY-MM-DD
export const LabelIds = z.array(Id).max(MAX_TICKET_LABELS)

export const ProjectQuery = z.object({ id: QueryId })
export const TicketQuery = z.object({ project: QueryId, number: QueryId })
export const ArchivedQuery = z.object({ project: QueryId })

export const SaveProjectRequest = z.strictObject({
  id: Id.optional(),
  name: ProjectName,
  prefix: Prefix.optional(),
  colour: Colour.default(null),
})
export const ArchiveRequest = z.strictObject({ id: Id, archived: z.boolean() })
export const IdRequest = z.strictObject({ id: Id })

export const SaveColumnRequest = z.strictObject({
  id: Id.optional(),
  project: Id,
  name: ShortName,
  colour: Colour.default(null),
})
export const ReorderColumnsRequest = z.strictObject({
  project: Id,
  order: z.array(Id).min(1).max(MAX_COLUMNS),
})
export const DeleteColumnRequest = z.strictObject({
  id: Id,
  moveTo: Id.optional(),
})

export const SaveLabelRequest = z.strictObject({
  id: Id.optional(),
  project: Id.nullable(), // null: shared
  name: ShortName,
  colour: Colour.default(null),
})

export const CreateTicketRequest = z.strictObject({
  project: Id,
  column: Id.optional(),
  title: Title,
  description: Description.default(''),
  priority: PriorityName.default('none'),
  dueOn: DueOn.default(null),
  labels: LabelIds.default([]),
})
export const UpdateTicketRequest = z
  .strictObject({
    id: Id,
    title: Title.optional(),
    description: Description.optional(),
    priority: PriorityName.optional(),
    dueOn: DueOn.optional(),
    labels: LabelIds.optional(),
  })
  .refine((ticket) => Object.keys(ticket).length > 1, 'Name a field to change')
// beside: the ticket it lands before or after; null is the top of the column.
export const MoveTicketRequest = z.strictObject({
  id: Id,
  column: Id,
  beside: Id.nullable(),
  place: z.enum(['before', 'after']),
})

export const SaveCommentRequest = z.strictObject({
  id: Id.optional(),
  ticket: Id,
  body: CommentBody,
})

export type SaveProject = z.input<typeof SaveProjectRequest>
export type SaveColumn = z.input<typeof SaveColumnRequest>
export type ReorderColumns = z.input<typeof ReorderColumnsRequest>
export type DeleteColumn = z.input<typeof DeleteColumnRequest>
export type SaveLabel = z.input<typeof SaveLabelRequest>
export type CreateTicket = z.input<typeof CreateTicketRequest>
export type UpdateTicket = z.input<typeof UpdateTicketRequest>
export type MoveTicket = z.input<typeof MoveTicketRequest>
export type SaveComment = z.input<typeof SaveCommentRequest>

// "1 ticket", "5 tickets".
export function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export function ticketKey(prefix: string, number: number): string {
  return `${prefix}-${number}`
}

// The first five letters of the name, or PRJ when it has none: "Beans & co" is BEANS.
export function derivePrefix(name: string): string {
  return (
    name
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 5)
      .toUpperCase() || 'PRJ'
  )
}
