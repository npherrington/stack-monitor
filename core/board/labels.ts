// Labels: shared ones every project can put on a ticket, and ones that belong to one project.
import type { z } from 'zod'

import { failure, type ActionResult } from '../types.ts'
import { done, get, run, write, type BoardContext } from './db.ts'
import { countOf, type SaveLabelRequest } from './schema.ts'

interface LabelRow {
  id: number
  name: string
  project_id: number | null
}

export function saveLabel(
  { id, project, name, colour }: z.output<typeof SaveLabelRequest>,
  context: BoardContext,
): ActionResult {
  return write(context, failure, (db) => {
    const owner =
      project === null
        ? null
        : get<{ name: string }>(
            db,
            'SELECT name FROM project WHERE id = ?',
            project,
          )
    if (owner === undefined) return failure(`There's no project ${project}`)
    if (id !== undefined) {
      const stored = get<LabelRow>(
        db,
        'SELECT id, name, project_id FROM label WHERE id = ?',
        id,
      )
      if (stored === undefined) return failure(`There's no label ${id}`)
      if (stored.project_id !== project) {
        return failure('A label stays shared or with its project')
      }
    }
    // No two labels a project can see share a name. A shared label shows in every project, so it
    // can't take any label's name; a project's can't take a shared one's or another of its own.
    const twin =
      project === null
        ? get<LabelRow>(
            db,
            `SELECT id, name, project_id FROM label
              WHERE name = ? COLLATE NOCASE AND id != ?`,
            name,
            id ?? 0,
          )
        : get<LabelRow>(
            db,
            `SELECT id, name, project_id FROM label
              WHERE name = ? COLLATE NOCASE AND id != ?
                AND (project_id IS NULL OR project_id = ?)`,
            name,
            id ?? 0,
            project,
          )
    if (twin !== undefined) {
      const where =
        twin.project_id === null
          ? 'There is already a shared label'
          : `${get<{ name: string }>(db, 'SELECT name FROM project WHERE id = ?', twin.project_id)?.name ?? 'A project'} already has a label`
      return failure(`${where} called ${twin.name}`)
    }
    if (id !== undefined) {
      run(
        db,
        'UPDATE label SET name = ?, colour = ? WHERE id = ?',
        name,
        colour,
        id,
      )
      return done(`Saved ${name}`)
    }
    run(
      db,
      'INSERT INTO label (project_id, name, colour) VALUES (?, ?, ?)',
      project,
      name,
      colour,
    )
    return done(`Added ${name}`)
  })
}

export function deleteLabel(id: number, context: BoardContext): ActionResult {
  return write(context, failure, (db) => {
    const label = get<{ name: string; uses: number }>(
      db,
      `SELECT name,
          (SELECT count(*) FROM ticket_label WHERE label_id = label.id) AS uses
        FROM label WHERE id = ?`,
      id,
    )
    if (label === undefined) return failure(`There's no label ${id}`)
    run(db, 'DELETE FROM label WHERE id = ?', id)
    return done(
      label.uses === 0
        ? `Deleted ${label.name}`
        : `Deleted ${label.name}; it came off ${countOf(label.uses, 'ticket')}`,
    )
  })
}
