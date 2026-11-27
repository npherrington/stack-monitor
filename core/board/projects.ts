// Projects and their columns: each project is a board of its own, with a prefix for its tickets'
// ids and the columns its tickets sit in.
import type { z } from 'zod'

import { failure, type ActionResult, type SaveProjectResult } from '../types.ts'
import { all, done, get, run, write, type BoardContext } from './db.ts'
import {
  countOf,
  DEFAULT_COLUMNS,
  derivePrefix,
  MAX_COLUMNS,
  type ArchiveRequest,
  type DeleteColumnRequest,
  type ReorderColumnsRequest,
  type SaveColumnRequest,
  type SaveProjectRequest,
} from './schema.ts'

interface Named {
  id: number
  name: string
}

const noProject = (id: number) => `There's no project ${id}`

function refusedSave(message: string): SaveProjectResult {
  return { ...failure(message), id: null }
}

export function saveProject(
  request: z.output<typeof SaveProjectRequest>,
  context: BoardContext,
): SaveProjectResult {
  return write(context, refusedSave, (db) => {
    const { id, name, colour } = request
    const stored =
      id === undefined
        ? undefined
        : get<{ prefix: string }>(
            db,
            'SELECT prefix FROM project WHERE id = ?',
            id,
          )
    if (id !== undefined && stored === undefined) {
      return refusedSave(noProject(id))
    }
    const prefix = request.prefix ?? stored?.prefix ?? derivePrefix(name)
    // Archived projects keep their prefix: restoring one mustn't meet its own ids on another.
    const holder = get<Named>(
      db,
      'SELECT id, name FROM project WHERE prefix = ?',
      prefix,
    )
    if (holder !== undefined && holder.id !== id) {
      return refusedSave(
        `${prefix} is ${holder.name}'s prefix. Choose another.`,
      )
    }
    if (id !== undefined) {
      run(
        db,
        'UPDATE project SET name = ?, prefix = ?, colour = ? WHERE id = ?',
        name,
        prefix,
        colour,
        id,
      )
      return { ...done(`Saved ${name}`), id }
    }
    const made = run(
      db,
      'INSERT INTO project (name, prefix, colour) VALUES (?, ?, ?)',
      name,
      prefix,
      colour,
    )
    DEFAULT_COLUMNS.forEach((column, position) => {
      run(
        db,
        'INSERT INTO board_column (project_id, name, position) VALUES (?, ?, ?)',
        made,
        column,
        position,
      )
    })
    return { ...done(`Created ${name}`), id: made }
  })
}

export function archiveProject(
  { id, archived }: z.output<typeof ArchiveRequest>,
  context: BoardContext,
): ActionResult {
  return write(context, failure, (db, now) => {
    const project = get<Named>(
      db,
      'SELECT id, name FROM project WHERE id = ?',
      id,
    )
    if (project === undefined) return failure(noProject(id))
    // Archiving one already archived keeps the time it first was.
    run(
      db,
      `UPDATE project
        SET archived_at = CASE WHEN ? = 1 THEN ifnull(archived_at, ?) END
        WHERE id = ?`,
      archived ? 1 : 0,
      now,
      id,
    )
    return done(`${archived ? 'Archived' : 'Restored'} ${project.name}`)
  })
}

export function deleteProject(id: number, context: BoardContext): ActionResult {
  return write(context, failure, (db) => {
    const project = get<Named & { tickets: number }>(
      db,
      `SELECT id, name,
          (SELECT count(*) FROM ticket WHERE project_id = project.id) AS tickets
        FROM project WHERE id = ?`,
      id,
    )
    if (project === undefined) return failure(noProject(id))
    // The tables' ON DELETE CASCADE takes its columns, tickets, comments and own labels.
    run(db, 'DELETE FROM project WHERE id = ?', id)
    return done(
      project.tickets === 0
        ? `Deleted ${project.name}`
        : `Deleted ${project.name} and its ${countOf(project.tickets, 'ticket')}`,
    )
  })
}

interface ColumnRow extends Named {
  project_id: number
}

export function saveColumn(
  { id, project, name, colour }: z.output<typeof SaveColumnRequest>,
  context: BoardContext,
): ActionResult {
  return write(context, failure, (db) => {
    const owner = get<Named>(
      db,
      'SELECT id, name FROM project WHERE id = ?',
      project,
    )
    if (owner === undefined) return failure(noProject(project))
    const columns = all<ColumnRow>(
      db,
      'SELECT id, name, project_id FROM board_column WHERE project_id = ?',
      project,
    )
    if (id !== undefined && !columns.some((column) => column.id === id)) {
      return failure(`${owner.name} has no column ${id}`)
    }
    const twin = columns.find(
      (column) =>
        column.id !== id && column.name.toLowerCase() === name.toLowerCase(),
    )
    if (twin !== undefined) {
      return failure(`${owner.name} already has a column called ${twin.name}`)
    }
    if (id !== undefined) {
      run(
        db,
        'UPDATE board_column SET name = ?, colour = ? WHERE id = ?',
        name,
        colour,
        id,
      )
      return done(`Saved ${name}`)
    }
    if (columns.length >= MAX_COLUMNS) {
      return failure(`A project takes up to ${MAX_COLUMNS} columns`)
    }
    run(
      db,
      `INSERT INTO board_column (project_id, name, colour, position)
        VALUES (?, ?, ?, (SELECT ifnull(max(position), -1) + 1
          FROM board_column WHERE project_id = ?))`,
      project,
      name,
      colour,
      project,
    )
    return done(`Added ${name}`)
  })
}

export function reorderColumns(
  { project, order }: z.output<typeof ReorderColumnsRequest>,
  context: BoardContext,
): ActionResult {
  return write(context, failure, (db) => {
    const ids = all<{ id: number }>(
      db,
      'SELECT id FROM board_column WHERE project_id = ?',
      project,
    ).map((column) => column.id)
    if (ids.length === 0) return failure(noProject(project))
    const asked = new Set(order)
    if (
      asked.size !== order.length ||
      order.length !== ids.length ||
      !ids.every((id) => asked.has(id))
    ) {
      return failure(
        'The columns have changed since this was read. Reload the board and move it again.',
      )
    }
    order.forEach((id, position) => {
      run(db, 'UPDATE board_column SET position = ? WHERE id = ?', position, id)
    })
    return done('Columns reordered')
  })
}

export function deleteColumn(
  { id, moveTo }: z.output<typeof DeleteColumnRequest>,
  context: BoardContext,
): ActionResult {
  return write(context, failure, (db) => {
    const column = get<ColumnRow>(
      db,
      'SELECT id, name, project_id FROM board_column WHERE id = ?',
      id,
    )
    if (column === undefined) return failure(`There's no column ${id}`)
    const siblings = all<Named>(
      db,
      'SELECT id, name FROM board_column WHERE project_id = ? AND id != ?',
      column.project_id,
      id,
    )
    if (siblings.length === 0) {
      return failure(
        `${column.name} is the project's last column. A project keeps at least one.`,
      )
    }
    // Archived tickets too: they still sit in a column, and Restore puts them back in it.
    const tickets = all<{ id: number; archived_at: string | null }>(
      db,
      `SELECT id, archived_at FROM ticket
        WHERE column_id = ? ORDER BY position, id`,
      id,
    )
    if (tickets.length === 0) {
      run(db, 'DELETE FROM board_column WHERE id = ?', id)
      return done(`Deleted ${column.name}`)
    }
    const archived = tickets.filter((each) => each.archived_at !== null).length
    const holds =
      archived === 0
        ? countOf(tickets.length, 'ticket')
        : `${countOf(tickets.length, 'ticket')}, ${archived} of them archived`
    if (moveTo === undefined) {
      return failure(
        `${column.name} has ${holds}. Choose the column they move to.`,
      )
    }
    const target = siblings.find((each) => each.id === moveTo)
    if (target === undefined) {
      return failure(
        moveTo === id
          ? 'Choose a different column for its tickets'
          : `The project has no column ${moveTo} to move them to`,
      )
    }
    const last =
      get<{ last: number | null }>(
        db,
        'SELECT max(position) AS last FROM ticket WHERE column_id = ?',
        moveTo,
      )?.last ?? -1
    tickets.forEach((ticket, index) => {
      run(
        db,
        'UPDATE ticket SET column_id = ?, position = ? WHERE id = ?',
        moveTo,
        last + 1 + index,
        ticket.id,
      )
    })
    run(db, 'DELETE FROM board_column WHERE id = ?', id)
    return done(`Deleted ${column.name}; its ${holds} moved to ${target.name}`)
  })
}
