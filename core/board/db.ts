// The ticket board's file: ~/.local/state/stack-monitor/board.db ($STACK_MONITOR_BOARD), a SQLite
// database opened for one read or one write at a time and closed after it.
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { errorMessage, type ActionResult } from '../types.ts'

export const BOARD_ENV = 'STACK_MONITOR_BOARD'

export function boardFile(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env[BOARD_ENV] ||
    join(homedir(), '.local', 'state', 'stack-monitor', 'board.db')
  )
}

export interface BoardContext {
  file: string
  now?: () => Date // a test's clock
}

export function boardContext(file: string): BoardContext {
  return { file }
}

export type Problem = { problem: string }

// MIGRATIONS[n] takes a file from version n to n + 1 (PRAGMA user_version). A shipped step is
// never edited: a change to the tables is a new step.
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE project (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL UNIQUE,
    colour TEXT,
    next_number INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT
  ) STRICT;

  CREATE TABLE board_column (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    colour TEXT,
    position INTEGER NOT NULL,
    UNIQUE (project_id, id)
  ) STRICT;
  CREATE UNIQUE INDEX board_column_name ON board_column (project_id, name COLLATE NOCASE);

  CREATE TABLE label (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES project (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    colour TEXT
  ) STRICT;
  CREATE UNIQUE INDEX label_name ON label (ifnull(project_id, 0), name COLLATE NOCASE);

  CREATE TABLE ticket (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    column_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'none',
    due_on TEXT,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (project_id, number),
    FOREIGN KEY (project_id, column_id) REFERENCES board_column (project_id, id)
  ) STRICT;
  CREATE INDEX ticket_column ON ticket (column_id, position);

  CREATE TABLE ticket_label (
    ticket_id INTEGER NOT NULL REFERENCES ticket (id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES label (id) ON DELETE CASCADE,
    PRIMARY KEY (ticket_id, label_id)
  ) STRICT, WITHOUT ROWID;
  CREATE INDEX ticket_label_label ON ticket_label (label_id);

  CREATE TABLE comment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL REFERENCES ticket (id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    edited_at TEXT
  ) STRICT;
  CREATE INDEX comment_ticket ON comment (ticket_id);
  `,
  'ALTER TABLE ticket ADD COLUMN colour TEXT;',
]

type Param = string | number | null

export function all<Row>(
  db: DatabaseSync,
  sql: string,
  ...params: Param[]
): Row[] {
  return db.prepare(sql).all(...params) as Row[]
}

export function get<Row>(
  db: DatabaseSync,
  sql: string,
  ...params: Param[]
): Row | undefined {
  return db.prepare(sql).get(...params) as Row | undefined
}

// The id of the row an INSERT made.
export function run(db: DatabaseSync, sql: string, ...params: Param[]): number {
  return Number(db.prepare(sql).run(...params).lastInsertRowid)
}

function version(db: DatabaseSync): number {
  return get<{ user_version: number }>(db, 'PRAGMA user_version')!.user_version
}

// Runs the steps the file is missing, under the write lock. The version is read again inside it:
// another monitor may have migrated the file while this one waited.
function migrate(db: DatabaseSync, migrations: readonly string[]): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    const from = version(db)
    if (from < migrations.length) {
      for (const step of migrations.slice(from)) db.exec(step)
      // A number from this file, never input: PRAGMA takes no bound parameter.
      db.exec(`PRAGMA user_version = ${migrations.length}`)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// The database at the current schema version, its folder made first. A problem when the file
// isn't SQLite, can't be opened, or was written by a newer monitor; the file is left as it was.
export function openBoard(
  file: string,
  migrations: readonly string[] = MIGRATIONS,
): DatabaseSync | Problem {
  let db: DatabaseSync
  try {
    mkdirSync(dirname(file), { recursive: true })
    // A second monitor writing at the same moment is waited for, not failed on.
    // Foreign keys asked for by name rather than left to the default: the deletes rest on
    // ON DELETE CASCADE.
    db = new DatabaseSync(file, {
      timeout: 2000,
      enableForeignKeyConstraints: true,
    })
  } catch (error) {
    return {
      problem: `Couldn't open the board's file ${file}: ${errorMessage(error)}`,
    }
  }
  try {
    // SQLite reads the file here for the first time, so this is where a file that isn't a
    // database says so.
    if (version(db) < migrations.length) migrate(db, migrations)
    if (version(db) > migrations.length) {
      db.close()
      return {
        problem: `The board's file ${file} was written by a newer stack monitor. Update this one to open it.`,
      }
    }
    return db
  } catch (error) {
    db.close()
    return {
      problem: `The board's file ${file} doesn't read as a board: ${errorMessage(error)}`,
    }
  }
}

// Several reads of one snapshot, then closed.
export function read<T>(
  context: BoardContext,
  work: (db: DatabaseSync) => T,
): T | Problem {
  const db = openBoard(context.file)
  if (!(db instanceof DatabaseSync)) return db
  try {
    db.exec('BEGIN')
    try {
      return work(db)
    } finally {
      db.exec('COMMIT')
    }
  } finally {
    db.close()
  }
}

// One transaction, closed after. Rolled back when work answers ok: false or throws; a problem
// opening the file is refuse(problem).
export function write<Result extends ActionResult>(
  context: BoardContext,
  refuse: (message: string) => Result,
  work: (db: DatabaseSync, now: string) => Result,
): Result {
  const db = openBoard(context.file)
  if (!(db instanceof DatabaseSync)) return refuse(db.problem)
  try {
    db.exec('BEGIN IMMEDIATE')
    let result: Result
    try {
      result = work(db, (context.now?.() ?? new Date()).toISOString())
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    db.exec(result.ok ? 'COMMIT' : 'ROLLBACK')
    return result
  } finally {
    db.close()
  }
}

export function done(message: string): ActionResult {
  return { ok: true, message, log: null }
}

const pad = (part: number) => String(part).padStart(2, '0')

// Today on this machine as YYYY-MM-DD, which is how a due date is stored.
export function localDate(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}
