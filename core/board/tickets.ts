// Tickets, their place in a column, and their comments.
import type { DatabaseSync } from 'node:sqlite'
import type { z } from 'zod'

import {
  failure,
  type ActionResult,
  type CreateTicketResult,
} from '../types.ts'
import { all, done, get, run, write, type BoardContext } from './db.ts'
import {
  ticketKey,
  type ArchiveRequest,
  type CreateTicketRequest,
  type MoveTicketRequest,
  type SaveCommentRequest,
  type UpdateTicketRequest,
} from './schema.ts'

interface TicketRow {
  id: number
  project_id: number
  number: number
  column_id: number
  title: string
  description: string
  priority: string
  colour: string | null
  due_on: string | null
  archived_at: string | null
  prefix: string
}

function ticketRow(db: DatabaseSync, id: number): TicketRow | undefined {
  return get<TicketRow>(
    db,
    `SELECT t.id, t.project_id, t.number, t.column_id, t.title, t.description,
        t.priority, t.colour, t.due_on, t.archived_at, p.prefix
      FROM ticket t JOIN project p ON p.id = t.project_id
      WHERE t.id = ?`,
    id,
  )
}

const keyOf = (ticket: TicketRow) => ticketKey(ticket.prefix, ticket.number)
const noTicket = (id: number) => `There's no ticket ${id}`

function columnIn(
  db: DatabaseSync,
  project: number,
  column: number,
): { id: number; name: string } | undefined {
  return get(
    db,
    'SELECT id, name FROM board_column WHERE id = ? AND project_id = ?',
    column,
    project,
  )
}

// One place above the column's top card, so nothing else is renumbered.
function topOf(db: DatabaseSync, column: number): number {
  const top = get<{ top: number | null }>(
    db,
    `SELECT min(position) AS top FROM ticket
      WHERE column_id = ? AND archived_at IS NULL`,
    column,
  )?.top
  return top === null || top === undefined ? 0 : top - 1
}

// Whether every label is one the project can use: a shared one or its own. The ids go in as one
// JSON parameter, so the statement's text never depends on how many there are.
function labelsFit(db: DatabaseSync, project: number, labels: number[]) {
  const fitting =
    get<{ fitting: number }>(
      db,
      `SELECT count(*) AS fitting FROM label
        WHERE id IN (SELECT value FROM json_each(?))
          AND (project_id IS NULL OR project_id = ?)`,
      JSON.stringify(labels),
      project,
    )?.fitting ?? 0
  return fitting === new Set(labels).size
}

function setLabels(db: DatabaseSync, ticket: number, labels: number[]): void {
  run(db, 'DELETE FROM ticket_label WHERE ticket_id = ?', ticket)
  for (const label of new Set(labels)) {
    run(
      db,
      'INSERT INTO ticket_label (ticket_id, label_id) VALUES (?, ?)',
      ticket,
      label,
    )
  }
}

const WRONG_LABEL = "One of those labels isn't this project's or a shared one"

function refusedCreate(message: string): CreateTicketResult {
  return { ...failure(message), number: null }
}

export function createTicket(
  request: z.output<typeof CreateTicketRequest>,
  context: BoardContext,
): CreateTicketResult {
  return write(context, refusedCreate, (db, now) => {
    const project = get<{ prefix: string; next_number: number }>(
      db,
      'SELECT prefix, next_number FROM project WHERE id = ?',
      request.project,
    )
    if (project === undefined) {
      return refusedCreate(`There's no project ${request.project}`)
    }
    const column =
      request.column === undefined
        ? get<{ id: number }>(
            db,
            `SELECT id FROM board_column
              WHERE project_id = ? ORDER BY position, id LIMIT 1`,
            request.project,
          )
        : columnIn(db, request.project, request.column)
    if (column === undefined) {
      return refusedCreate("That column isn't in this project")
    }
    if (!labelsFit(db, request.project, request.labels)) {
      return refusedCreate(WRONG_LABEL)
    }
    // The counter only goes up, so a deleted ticket's number is never given out again.
    const number = project.next_number
    run(
      db,
      'UPDATE project SET next_number = ? WHERE id = ?',
      number + 1,
      request.project,
    )
    const id = run(
      db,
      `INSERT INTO ticket (project_id, number, column_id, position, title,
          description, priority, due_on, colour, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      request.project,
      number,
      column.id,
      topOf(db, column.id),
      request.title,
      request.description,
      request.priority,
      request.dueOn,
      request.colour,
      now,
    )
    setLabels(db, id, request.labels)
    return { ...done(`Created ${ticketKey(project.prefix, number)}`), number }
  })
}

export function updateTicket(
  request: z.output<typeof UpdateTicketRequest>,
  context: BoardContext,
): ActionResult {
  return write(context, failure, (db) => {
    const ticket = ticketRow(db, request.id)
    if (ticket === undefined) return failure(noTicket(request.id))
    if (
      request.labels !== undefined &&
      !labelsFit(db, ticket.project_id, request.labels)
    ) {
      return failure(WRONG_LABEL)
    }
    // Every column is written from the stored row with the named fields over it, so one fixed
    // statement serves any mix of fields. dueOn or colour: null clears it; left out keeps it.
    run(
      db,
      `UPDATE ticket SET title = ?, description = ?, priority = ?, due_on = ?,
        colour = ? WHERE id = ?`,
      request.title ?? ticket.title,
      request.description ?? ticket.description,
      request.priority ?? ticket.priority,
      request.dueOn === undefined ? ticket.due_on : request.dueOn,
      request.colour === undefined ? ticket.colour : request.colour,
      ticket.id,
    )
    if (request.labels !== undefined) setLabels(db, ticket.id, request.labels)
    return done(`Saved ${keyOf(ticket)}`)
  })
}

export function moveTicket(
  { id, column, beside, place }: z.output<typeof MoveTicketRequest>,
  context: BoardContext,
): ActionResult {
  return write(context, failure, (db) => {
    const ticket = ticketRow(db, id)
    if (ticket === undefined) return failure(noTicket(id))
    if (ticket.archived_at !== null) {
      return failure(`${keyOf(ticket)} is archived. Restore it to move it.`)
    }
    const target = columnIn(db, ticket.project_id, column)
    if (target === undefined) {
      return failure("That column isn't in this ticket's project")
    }
    const others = all<{ id: number; position: number }>(
      db,
      `SELECT id, position FROM ticket
        WHERE column_id = ? AND archived_at IS NULL AND id != ?
        ORDER BY position, id`,
      column,
      id,
    )
    let at = 0
    if (beside !== null) {
      if (beside === id) return failure("A card can't land beside itself")
      const anchor = others.findIndex((each) => each.id === beside)
      // Another tab moved or archived the card this one was dropped beside.
      if (anchor === -1) {
        return failure('The card it was dropped beside has moved since')
      }
      at = anchor + (place === 'after' ? 1 : 0)
    }
    run(db, 'UPDATE ticket SET column_id = ? WHERE id = ?', column, id)
    const order = [
      ...others.slice(0, at).map((each) => each.id),
      id,
      ...others.slice(at).map((each) => each.id),
    ]
    order.forEach((each, position) => {
      run(db, 'UPDATE ticket SET position = ? WHERE id = ?', position, each)
    })
    return done(`Moved ${keyOf(ticket)} to ${target.name}`)
  })
}

export function archiveTicket(
  { id, archived }: z.output<typeof ArchiveRequest>,
  context: BoardContext,
): ActionResult {
  return write(context, failure, (db, now) => {
    const ticket = ticketRow(db, id)
    if (ticket === undefined) return failure(noTicket(id))
    const isArchived = ticket.archived_at !== null
    if (archived && !isArchived) {
      run(db, 'UPDATE ticket SET archived_at = ? WHERE id = ?', now, id)
    }
    if (!archived && isArchived) {
      run(
        db,
        'UPDATE ticket SET archived_at = NULL, position = ? WHERE id = ?',
        topOf(db, ticket.column_id),
        id,
      )
    }
    return done(`${archived ? 'Archived' : 'Restored'} ${keyOf(ticket)}`)
  })
}

export function deleteTicket(id: number, context: BoardContext): ActionResult {
  return write(context, failure, (db) => {
    const ticket = ticketRow(db, id)
    if (ticket === undefined) return failure(noTicket(id))
    // Its comments and label links go with it (ON DELETE CASCADE).
    run(db, 'DELETE FROM ticket WHERE id = ?', id)
    return done(`Deleted ${keyOf(ticket)}`)
  })
}

export function saveComment(
  { id, ticket, body }: z.output<typeof SaveCommentRequest>,
  context: BoardContext,
): ActionResult {
  return write(context, failure, (db, now) => {
    if (ticketRow(db, ticket) === undefined) return failure(noTicket(ticket))
    if (id === undefined) {
      run(
        db,
        'INSERT INTO comment (ticket_id, body, created_at) VALUES (?, ?, ?)',
        ticket,
        body,
        now,
      )
      return done('Comment added')
    }
    const stored = get<{ ticket_id: number }>(
      db,
      'SELECT ticket_id FROM comment WHERE id = ?',
      id,
    )
    if (stored === undefined) return failure(`There's no comment ${id}`)
    if (stored.ticket_id !== ticket) {
      return failure("That comment isn't on this ticket")
    }
    run(
      db,
      'UPDATE comment SET body = ?, edited_at = ? WHERE id = ?',
      body,
      now,
      id,
    )
    return done('Comment saved')
  })
}

export function deleteComment(id: number, context: BoardContext): ActionResult {
  return write(context, failure, (db) => {
    const stored = get<{ id: number }>(
      db,
      'SELECT id FROM comment WHERE id = ?',
      id,
    )
    if (stored === undefined) return failure(`There's no comment ${id}`)
    run(db, 'DELETE FROM comment WHERE id = ?', id)
    return done('Comment deleted')
  })
}
