// What the board's routes answer: the projects, one project's board, one ticket, and a project's
// archived tickets. null where the project or ticket asked for isn't there.
import type { DatabaseSync } from 'node:sqlite'

import {
  BOARD_COLOURS,
  PRIORITIES,
  type ArchivedTickets,
  type BoardColour,
  type BoardLabel,
  type BoardOverview,
  type BoardProject,
  type Priority,
  type ProjectBoard,
  type TicketDetail,
  type TicketLabel,
  type TicketSummary,
} from '../types.ts'
import {
  all,
  get,
  localDate,
  read,
  type BoardContext,
  type Problem,
} from './db.ts'
import { ticketKey } from './schema.ts'

// A colour or priority this version doesn't know reads as none.
function asColour(value: string | null): BoardColour | null {
  return BOARD_COLOURS.includes(value as BoardColour)
    ? (value as BoardColour)
    : null
}

function asPriority(value: string): Priority {
  return PRIORITIES.includes(value as Priority) ? (value as Priority) : 'none'
}

interface ProjectRow {
  id: number
  name: string
  prefix: string
  colour: string | null
  archived_at: string | null
  tickets: number
  archived_tickets: number
}

const PROJECT_COLUMNS = `
  p.id, p.name, p.prefix, p.colour, p.archived_at,
  (SELECT count(*) FROM ticket t
    WHERE t.project_id = p.id AND t.archived_at IS NULL) AS tickets,
  (SELECT count(*) FROM ticket t
    WHERE t.project_id = p.id AND t.archived_at IS NOT NULL) AS archived_tickets`

function toProject(row: ProjectRow): BoardProject {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    colour: asColour(row.colour),
    archived: row.archived_at !== null,
    tickets: row.tickets,
    archivedTickets: row.archived_tickets,
  }
}

function projectRow(db: DatabaseSync, id: number): ProjectRow | undefined {
  return get<ProjectRow>(
    db,
    `SELECT ${PROJECT_COLUMNS} FROM project p WHERE p.id = ?`,
    id,
  )
}

export function readBoard(context: BoardContext): BoardOverview | Problem {
  return read(context, (db) => ({
    projects: all<ProjectRow>(
      db,
      `SELECT ${PROJECT_COLUMNS} FROM project p
        ORDER BY p.archived_at IS NOT NULL, p.id`,
    ).map(toProject),
  }))
}

interface TicketRow {
  id: number
  number: number
  title: string
  column_id: number
  priority: string
  due_on: string | null
  archived_at: string | null
  created_at: string
  comments: number
}

const TICKET_COLUMNS = `
  t.id, t.number, t.title, t.column_id, t.priority, t.due_on,
  t.archived_at, t.created_at,
  (SELECT count(*) FROM comment c WHERE c.ticket_id = t.id) AS comments`

// Every label on the project's tickets, by ticket, each ticket's by name.
function labelsByTicket(
  db: DatabaseSync,
  project: number,
): Map<number, TicketLabel[]> {
  const byTicket = new Map<number, TicketLabel[]>()
  const rows = all<{
    ticket_id: number
    id: number
    name: string
    colour: string | null
  }>(
    db,
    `SELECT tl.ticket_id, l.id, l.name, l.colour
      FROM ticket_label tl
      JOIN label l ON l.id = tl.label_id
      JOIN ticket t ON t.id = tl.ticket_id
      WHERE t.project_id = ?
      ORDER BY l.name COLLATE NOCASE, l.id`,
    project,
  )
  for (const row of rows) {
    const labels = byTicket.get(row.ticket_id) ?? []
    labels.push({ id: row.id, name: row.name, colour: asColour(row.colour) })
    byTicket.set(row.ticket_id, labels)
  }
  return byTicket
}

function toSummary(
  row: TicketRow,
  prefix: string,
  labels: Map<number, TicketLabel[]>,
  now: string, // today, YYYY-MM-DD
): TicketSummary {
  return {
    id: row.id,
    number: row.number,
    key: ticketKey(prefix, row.number),
    title: row.title,
    column: row.column_id,
    priority: asPriority(row.priority),
    dueOn: row.due_on,
    // Both are YYYY-MM-DD, which sorts as text. Due today isn't overdue.
    overdue: row.due_on !== null && row.due_on < now,
    labels: labels.get(row.id) ?? [],
    commentCount: row.comments,
  }
}

function today(context: BoardContext): string {
  return localDate(context.now?.() ?? new Date())
}

export function readProjectBoard(
  id: number,
  context: BoardContext,
): ProjectBoard | Problem | null {
  return read(context, (db) => {
    const project = projectRow(db, id)
    if (project === undefined) return null
    const labels = labelsByTicket(db, id)
    const now = today(context)
    const tickets = all<TicketRow>(
      db,
      `SELECT ${TICKET_COLUMNS} FROM ticket t
        WHERE t.project_id = ? AND t.archived_at IS NULL
        ORDER BY t.position, t.id`,
      id,
    ).map((row) => toSummary(row, project.prefix, labels, now))
    const columns = all<{ id: number; name: string; colour: string | null }>(
      db,
      `SELECT id, name, colour FROM board_column
        WHERE project_id = ? ORDER BY position, id`,
      id,
    )
    const boardLabels: BoardLabel[] = all<{
      id: number
      project_id: number | null
      name: string
      colour: string | null
      uses: number
    }>(
      db,
      `SELECT l.id, l.project_id, l.name, l.colour,
          (SELECT count(*) FROM ticket_label tl WHERE tl.label_id = l.id) AS uses
        FROM label l
        WHERE l.project_id IS NULL OR l.project_id = ?
        ORDER BY l.project_id IS NOT NULL, l.name COLLATE NOCASE, l.id`,
      id,
    ).map((row) => ({
      id: row.id,
      project: row.project_id,
      name: row.name,
      colour: asColour(row.colour),
      uses: row.uses,
    }))
    return {
      project: toProject(project),
      columns: columns.map((column) => ({
        id: column.id,
        name: column.name,
        colour: asColour(column.colour),
        tickets: tickets.filter((ticket) => ticket.column === column.id),
      })),
      labels: boardLabels,
    }
  })
}

export function readTicket(
  project: number,
  number: number,
  context: BoardContext,
): TicketDetail | Problem | null {
  return read(context, (db) => {
    const owner = projectRow(db, project)
    if (owner === undefined) return null
    // The description is read here only: a board's cards don't show it.
    const row = get<TicketRow & { description: string }>(
      db,
      `SELECT ${TICKET_COLUMNS}, t.description FROM ticket t
        WHERE t.project_id = ? AND t.number = ?`,
      project,
      number,
    )
    if (row === undefined) return null
    const comments = all<{
      id: number
      body: string
      created_at: string
      edited_at: string | null
    }>(
      db,
      `SELECT id, body, created_at, edited_at FROM comment
        WHERE ticket_id = ? ORDER BY id`,
      row.id,
    )
    return {
      ...toSummary(
        row,
        owner.prefix,
        labelsByTicket(db, project),
        today(context),
      ),
      description: row.description,
      archived: row.archived_at !== null,
      createdAt: row.created_at,
      comments: comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.created_at,
        editedAt: comment.edited_at,
      })),
    }
  })
}

export function readArchivedTickets(
  project: number,
  context: BoardContext,
): ArchivedTickets | Problem | null {
  return read(context, (db) => {
    const owner = projectRow(db, project)
    if (owner === undefined) return null
    const labels = labelsByTicket(db, project)
    const now = today(context)
    const rows = all<TicketRow & { column_name: string }>(
      db,
      `SELECT ${TICKET_COLUMNS}, c.name AS column_name
        FROM ticket t JOIN board_column c ON c.id = t.column_id
        WHERE t.project_id = ? AND t.archived_at IS NOT NULL
        ORDER BY t.archived_at DESC, t.id DESC`,
      project,
    )
    return {
      tickets: rows.map((row) => ({
        ...toSummary(row, owner.prefix, labels, now),
        archivedAt: row.archived_at ?? '',
        columnName: row.column_name,
      })),
    }
  })
}
