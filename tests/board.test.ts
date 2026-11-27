import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, test } from 'node:test'

import {
  MIGRATIONS,
  openBoard,
  read,
  write,
  type BoardContext,
} from '../core/board/db.ts'
import { deleteLabel, saveLabel } from '../core/board/labels.ts'
import {
  archiveProject,
  deleteColumn,
  deleteProject,
  reorderColumns,
  saveColumn,
  saveProject,
} from '../core/board/projects.ts'
import {
  readArchivedTickets,
  readBoard,
  readProjectBoard,
  readTicket,
} from '../core/board/read.ts'
import {
  CreateTicketRequest,
  DEFAULT_COLUMNS,
  derivePrefix,
  MAX_TITLE,
  SaveColumnRequest,
  SaveProjectRequest,
  UpdateTicketRequest,
} from '../core/board/schema.ts'
import {
  archiveTicket,
  createTicket,
  deleteComment,
  deleteTicket,
  moveTicket,
  saveComment,
  updateTicket,
} from '../core/board/tickets.ts'
import {
  failure,
  type ArchivedTickets,
  type ProjectBoard,
  type TicketDetail,
} from '../core/types.ts'
import { tempDir } from './fixtures.ts'

// A board of its own per test, in a file that doesn't exist yet.
function board(): BoardContext {
  return { file: join(tempDir(), 'state', 'board.db') }
}

function project(context: BoardContext, name: string, prefix?: string): number {
  const saved = saveProject({ name, prefix, colour: null }, context)
  assert.equal(saved.ok, true, saved.message)
  return saved.id!
}

function boardOf(context: BoardContext, id: number): ProjectBoard {
  const found = readProjectBoard(id, context)
  assert.ok(found !== null && !('problem' in found))
  return found
}

function ticket(
  context: BoardContext,
  projectId: number,
  title: string,
  more: { column?: number; labels?: number[]; dueOn?: string | null } = {},
): number {
  const made = createTicket(
    {
      project: projectId,
      title,
      description: '',
      priority: 'none',
      dueOn: null,
      labels: [],
      ...more,
    },
    context,
  )
  assert.equal(made.ok, true, made.message)
  const column = boardOf(context, projectId).columns.find((each) =>
    each.tickets.some((card) => card.number === made.number),
  )
  return column!.tickets.find((card) => card.number === made.number)!.id
}

function detail(
  context: BoardContext,
  projectId: number,
  number: number,
): TicketDetail {
  const found = readTicket(projectId, number, context)
  assert.ok(found !== null && !('problem' in found))
  return found
}

function archivedOf(context: BoardContext, id: number): ArchivedTickets {
  const found = readArchivedTickets(id, context)
  assert.ok(found !== null && !('problem' in found))
  return found
}

const titles = (found: ProjectBoard, column: number) =>
  found.columns[column].tickets.map((card) => card.title)

function label(
  context: BoardContext,
  projectId: number | null,
  name: string,
): number {
  const saved = saveLabel({ project: projectId, name, colour: 'blue' }, context)
  assert.equal(saved.ok, true, saved.message)
  const id = read(
    context,
    (db) =>
      db
        .prepare('SELECT id FROM label WHERE name = ? AND project_id IS ?')
        .get(name, projectId)!.id,
  )
  return id as number
}

describe('the board file', () => {
  test('a new file is made, folder and all, at the current schema version', () => {
    const context = board()
    assert.deepEqual(readBoard(context), { projects: [] })
    assert.equal(existsSync(context.file), true)
    const db = new DatabaseSync(context.file)
    const { user_version: version } = db.prepare('PRAGMA user_version').get()!
    db.close()
    assert.equal(version, MIGRATIONS.length)
  })

  test("a file that isn't SQLite, or is from a newer version, is a problem and is left alone", () => {
    const text = join(tempDir(), 'board.db')
    writeFileSync(text, 'These are my notes, not a database.\n'.repeat(40))
    const newer = join(tempDir(), 'board.db')
    const db = new DatabaseSync(newer)
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`)
    db.close()
    for (const [file, says] of [
      [text, /doesn't read as a board/],
      [newer, /newer stack monitor/],
    ] as const) {
      const before = readFileSync(file)
      const answer = readBoard({ file })
      assert.ok('problem' in answer)
      assert.match(answer.problem, says)
      const refused = saveProject({ name: 'Beans', colour: null }, { file })
      assert.equal(refused.ok, false)
      assert.match(refused.message, says)
      assert.deepEqual(readFileSync(file), before)
    }
  })

  test('only the migrations a file is missing run', () => {
    const file = join(tempDir(), 'board.db')
    const first = 'CREATE TABLE one (id INTEGER PRIMARY KEY) STRICT;'
    const opened = openBoard(file, [first])
    assert.ok(opened instanceof DatabaseSync)
    opened.exec('INSERT INTO one (id) VALUES (7)')
    opened.close()
    // Step one would fail if it ran again: the table is there.
    const again = openBoard(file, [
      first,
      'CREATE TABLE two (id INTEGER PRIMARY KEY) STRICT;',
    ])
    assert.ok(again instanceof DatabaseSync)
    assert.deepEqual(
      again
        .prepare('SELECT id FROM one')
        .all()
        .map((row) => row.id),
      [7],
    )
    assert.deepEqual(again.prepare('SELECT id FROM two').all(), [])
    assert.equal(again.prepare('PRAGMA user_version').get()!.user_version, 2)
    again.close()
  })

  test('a write that refuses or throws changes nothing', () => {
    const context = board()
    project(context, 'Beans')
    const insert = (db: DatabaseSync) =>
      db
        .prepare("INSERT INTO project (name, prefix) VALUES ('Ghost', 'GHOST')")
        .run()
    const refused = write(context, failure, (db) => {
      insert(db)
      return failure('No')
    })
    assert.equal(refused.ok, false)
    assert.throws(() =>
      write(context, failure, (db) => {
        insert(db)
        throw new Error('disk full')
      }),
    )
    const names = read(context, (db) =>
      db
        .prepare('SELECT name FROM project')
        .all()
        .map((row) => row.name),
    )
    assert.deepEqual(names, ['Beans'])
  })
})

describe('board requests', () => {
  test("derivePrefix takes the name's first five letters", () => {
    for (const [name, prefix] of [
      ['Beans & co', 'BEANS'],
      ['web', 'WEB'],
      ['2026 road-map', 'ROADM'],
      ['42', 'PRJ'],
    ]) {
      assert.equal(derivePrefix(name), prefix)
    }
  })

  test('the request schemas refuse what the tables would otherwise hold', () => {
    const create = { project: 1, title: 'Fix it' }
    const refused: [
      string,
      { safeParse: (value: unknown) => { success: boolean } },
      unknown,
    ][] = [
      ['an empty title', CreateTicketRequest, { ...create, title: '  ' }],
      [
        'a title over the limit',
        CreateTicketRequest,
        { ...create, title: 'x'.repeat(MAX_TITLE + 1) },
      ],
      [
        'a title on two lines',
        CreateTicketRequest,
        { ...create, title: 'a\nb' },
      ],
      [
        "a date that isn't one",
        CreateTicketRequest,
        { ...create, dueOn: '2026-02-30' },
      ],
      [
        'a priority it has no word for',
        CreateTicketRequest,
        { ...create, priority: 'asap' },
      ],
      ['an unknown key', CreateTicketRequest, { ...create, assignee: 'me' }],
      [
        "a colour that isn't a swatch",
        SaveColumnRequest,
        { project: 1, name: 'Todo', colour: '#ff0000' },
      ],
      [
        'a prefix that starts with a digit',
        SaveProjectRequest,
        { name: 'Beans', prefix: '3BEANS' },
      ],
      [
        'a prefix with a dash in it',
        SaveProjectRequest,
        { name: 'Beans', prefix: 'BE-ANS' },
      ],
      ['an update naming no field', UpdateTicketRequest, { id: 1 }],
    ]
    for (const [what, schema, value] of refused) {
      assert.equal(schema.safeParse(value).success, false, what)
    }
    assert.deepEqual(CreateTicketRequest.parse(create), {
      ...create,
      description: '',
      priority: 'none',
      dueOn: null,
      labels: [],
    })
    assert.equal(
      SaveProjectRequest.parse({ name: ' Beans ', prefix: 'web2' }).prefix,
      'WEB2',
    )
  })
})

describe('projects and columns', () => {
  test('a new project starts with the six columns, in order', () => {
    const context = board()
    const id = project(context, 'Beans & co')
    const found = boardOf(context, id)
    assert.equal(found.project.prefix, 'BEANS')
    assert.deepEqual(
      found.columns.map((column) => column.name),
      [...DEFAULT_COLUMNS],
    )
  })

  test('a prefix belongs to one project, archived ones included', () => {
    const context = board()
    const beans = project(context, 'Beans')
    const web = project(context, 'Web')
    archiveProject({ id: beans, archived: true }, context)
    const made = saveProject(
      { name: 'Beans two', prefix: 'BEANS', colour: null },
      context,
    )
    assert.deepEqual(
      [made.ok, made.message, made.id],
      [false, "BEANS is Beans's prefix. Choose another.", null],
    )
    const renamed = saveProject(
      { id: web, name: 'Web', prefix: 'BEANS', colour: null },
      context,
    )
    assert.equal(renamed.ok, false)
    // Saving a project under the prefix it already has is no clash with itself.
    assert.equal(
      saveProject(
        { id: web, name: 'Website', prefix: 'WEB', colour: 'teal' },
        context,
      ).ok,
      true,
    )
    assert.equal(
      saveProject({ id: 99, name: 'Nope', colour: null }, context).ok,
      false,
    )
  })

  test('the reads answer projects unarchived first and columns left to right', () => {
    const context = board()
    const first = project(context, 'First')
    const second = project(context, 'Second')
    archiveProject({ id: first, archived: true }, context)
    const overview = readBoard(context)
    assert.ok(!('problem' in overview))
    assert.deepEqual(
      overview.projects.map((each) => [each.id, each.archived]),
      [
        [second, false],
        [first, true],
      ],
    )
    assert.equal(readProjectBoard(99, context), null)
  })

  test('archiving a project keeps its board; restoring brings it back', () => {
    const context = board()
    const id = project(context, 'Beans')
    ticket(context, id, 'Keep me')
    assert.equal(
      archiveProject({ id, archived: true }, context).message,
      'Archived Beans',
    )
    const archived = boardOf(context, id)
    assert.equal(archived.project.archived, true)
    assert.deepEqual(titles(archived, 0), ['Keep me'])
    assert.equal(
      archiveProject({ id, archived: false }, context).message,
      'Restored Beans',
    )
    assert.equal(boardOf(context, id).project.archived, false)
    assert.equal(archiveProject({ id: 99, archived: true }, context).ok, false)
  })

  test('a column is added last, renamed and recoloured; a second "todo" is refused', () => {
    const context = board()
    const id = project(context, 'Beans')
    assert.equal(
      saveColumn({ project: id, name: 'Shipped', colour: 'green' }, context).ok,
      true,
    )
    const added = boardOf(context, id).columns.at(-1)!
    assert.deepEqual([added.name, added.colour], ['Shipped', 'green'])
    assert.equal(
      saveColumn(
        { id: added.id, project: id, name: 'Live', colour: null },
        context,
      ).ok,
      true,
    )
    const renamed = boardOf(context, id).columns.at(-1)!
    assert.deepEqual([renamed.name, renamed.colour], ['Live', null])
    const twin = saveColumn(
      { project: id, name: 'todo', colour: null },
      context,
    )
    assert.deepEqual(
      [twin.ok, twin.message],
      [false, 'Beans already has a column called Todo'],
    )
    const other = project(context, 'Web')
    assert.equal(
      saveColumn(
        { id: added.id, project: other, name: 'Mine now', colour: null },
        context,
      ).ok,
      false,
    )
  })

  test("reordering takes the project's columns in any order and nothing else", () => {
    const context = board()
    const id = project(context, 'Beans')
    const ids = boardOf(context, id).columns.map((column) => column.id)
    const reversed = ids.toReversed()
    assert.equal(
      reorderColumns({ project: id, order: reversed }, context).ok,
      true,
    )
    assert.deepEqual(
      boardOf(context, id).columns.map((column) => column.id),
      reversed,
    )
    for (const order of [
      ids.slice(1),
      [...ids.slice(1), ids[1]],
      [...ids.slice(1), 999],
    ]) {
      assert.equal(reorderColumns({ project: id, order }, context).ok, false)
    }
  })

  test('deleting a column with tickets needs somewhere to move them', () => {
    const context = board()
    const id = project(context, 'Beans')
    const other = project(context, 'Web')
    const [backlog, todo] = boardOf(context, id).columns
    ticket(context, id, 'Stays', { column: todo.id })
    ticket(context, id, 'B', { column: backlog.id })
    const gone = ticket(context, id, 'A, archived', { column: backlog.id })
    archiveTicket({ id: gone, archived: true }, context)
    const unasked = deleteColumn({ id: backlog.id }, context)
    assert.deepEqual(
      [unasked.ok, unasked.message],
      [
        false,
        'Backlog has 2 tickets, 1 of them archived. Choose the column they move to.',
      ],
    )
    const elsewhere = boardOf(context, other).columns[0].id
    for (const moveTo of [backlog.id, elsewhere]) {
      assert.equal(deleteColumn({ id: backlog.id, moveTo }, context).ok, false)
    }
    const moved = deleteColumn({ id: backlog.id, moveTo: todo.id }, context)
    assert.equal(moved.ok, true, moved.message)
    const after = boardOf(context, id)
    assert.deepEqual(
      after.columns.map((column) => column.name),
      DEFAULT_COLUMNS.slice(1),
    )
    // After the target's own cards, and the archived one went with them.
    assert.deepEqual(titles(after, 0), ['Stays', 'B'])
    assert.deepEqual(
      archivedOf(context, id).tickets.map((card) => card.columnName),
      ['Todo'],
    )
  })

  test("a project's last column can't be deleted", () => {
    const context = board()
    const id = project(context, 'Beans')
    const columns = boardOf(context, id).columns
    for (const column of columns.slice(1)) {
      assert.equal(deleteColumn({ id: column.id }, context).ok, true)
    }
    const last = deleteColumn({ id: columns[0].id }, context)
    assert.equal(last.ok, false)
    assert.match(last.message, /last column/)
    assert.equal(boardOf(context, id).columns.length, 1)
  })
})

describe('labels', () => {
  test("a shared label goes on any project's ticket; a project's label only on its own", () => {
    const context = board()
    const beans = project(context, 'Beans')
    const web = project(context, 'Web')
    const shared = label(context, null, 'bug')
    const own = label(context, beans, 'api')
    label(context, null, 'Art')
    // Shared first, each group by name whatever its case.
    assert.deepEqual(
      boardOf(context, beans).labels.map((each) => [each.name, each.project]),
      [
        ['Art', null],
        ['bug', null],
        ['api', beans],
      ],
    )
    ticket(context, beans, 'Both', { labels: [shared, own] })
    ticket(context, web, 'Shared only', { labels: [shared] })
    const refused = createTicket(
      {
        project: web,
        title: 'No',
        description: '',
        priority: 'none',
        dueOn: null,
        labels: [own],
      },
      context,
    )
    assert.equal(refused.ok, false)
    assert.deepEqual(
      boardOf(context, beans).columns[0].tickets[0].labels.map(
        (each) => each.name,
      ),
      ['api', 'bug'],
    )
    assert.equal(
      boardOf(context, web).labels.find((each) => each.id === shared)!.uses,
      2,
    )
  })

  test('no two labels a project can see share a name, and a label keeps its scope', () => {
    const context = board()
    const beans = project(context, 'Beans')
    const web = project(context, 'Web')
    const shared = label(context, null, 'bug')
    label(context, beans, 'api')
    for (const [projectId, name, says] of [
      [beans, 'BUG', 'There is already a shared label called bug'],
      [beans, 'Api', 'Beans already has a label called api'],
      [null, 'api', 'Beans already has a label called api'],
    ] as const) {
      const twin = saveLabel(
        { project: projectId, name, colour: null },
        context,
      )
      assert.deepEqual([twin.ok, twin.message], [false, says])
    }
    // Another project can't see Beans's label, so it may have its own.
    assert.equal(
      saveLabel({ project: web, name: 'api', colour: null }, context).ok,
      true,
    )
    const moved = saveLabel(
      { id: shared, project: beans, name: 'bug', colour: null },
      context,
    )
    assert.deepEqual(
      [moved.ok, moved.message],
      [false, 'A label stays shared or with its project'],
    )
    assert.equal(
      saveLabel(
        { id: shared, project: null, name: 'defect', colour: 'red' },
        context,
      ).ok,
      true,
    )
    // Shared first, then Web's own.
    assert.deepEqual(
      boardOf(context, web).labels.map((each) => each.name),
      ['defect', 'api'],
    )
  })

  test('deleting a label takes it off its tickets', () => {
    const context = board()
    const id = project(context, 'Beans')
    const bug = label(context, null, 'bug')
    ticket(context, id, 'Carries it', { labels: [bug] })
    const deleted = deleteLabel(bug, context)
    assert.deepEqual(
      [deleted.ok, deleted.message],
      [true, 'Deleted bug; it came off 1 ticket'],
    )
    assert.deepEqual(boardOf(context, id).columns[0].tickets[0].labels, [])
    assert.equal(deleteLabel(bug, context).ok, false)
  })
})

describe('tickets', () => {
  test("tickets are numbered per project, and a deleted ticket's number is never given again", () => {
    const context = board()
    const beans = project(context, 'Beans')
    const web = project(context, 'Web')
    ticket(context, beans, 'One')
    const two = ticket(context, beans, 'Two')
    ticket(context, web, 'Web one')
    assert.equal(deleteTicket(two, context).message, 'Deleted BEANS-2')
    ticket(context, beans, 'Three')
    assert.deepEqual(
      boardOf(context, beans).columns[0].tickets.map((card) => card.key),
      ['BEANS-3', 'BEANS-1'],
    )
    assert.equal(boardOf(context, web).columns[0].tickets[0].key, 'WEB-1')
    assert.equal(readTicket(beans, 2, context), null)
  })

  test("renaming the prefix renames the tickets' keys and keeps their numbers", () => {
    const context = board()
    const id = project(context, 'Beans')
    ticket(context, id, 'One')
    saveProject({ id, name: 'Beans', prefix: 'BEAN', colour: null }, context)
    assert.equal(detail(context, id, 1).key, 'BEAN-1')
    // The old prefix is free again.
    assert.equal(project(context, 'Other beans', 'BEANS') > id, true)
  })

  test('a new ticket lands at the top of its column', () => {
    const context = board()
    const id = project(context, 'Beans')
    const done = boardOf(context, id).columns[4].id
    for (const title of ['First', 'Second', 'Third']) ticket(context, id, title)
    ticket(context, id, 'Finished', { column: done })
    const found = boardOf(context, id)
    assert.deepEqual(titles(found, 0), ['Third', 'Second', 'First'])
    assert.deepEqual(titles(found, 4), ['Finished'])
    assert.equal(found.project.tickets, 4)
  })

  test('a move within a column lands before or after its anchor and stays there', () => {
    const context = board()
    const id = project(context, 'Beans')
    const backlog = boardOf(context, id).columns[0].id
    const [a, , c] = ['A', 'B', 'C'].map((title) => ticket(context, id, title))
    // Top first: C, B, A.
    moveTicket({ id: c, column: backlog, beside: a, place: 'after' }, context)
    assert.deepEqual(titles(boardOf(context, id), 0), ['B', 'A', 'C'])
    moveTicket({ id: c, column: backlog, beside: a, place: 'before' }, context)
    assert.deepEqual(titles(boardOf(context, id), 0), ['B', 'C', 'A'])
    // A card made after the move still lands on top, and the rest keep their order.
    ticket(context, id, 'D')
    assert.deepEqual(titles(boardOf(context, id), 0), ['D', 'B', 'C', 'A'])
  })

  test("a move to another column changes the ticket's column at the place it was dropped", () => {
    const context = board()
    const id = project(context, 'Beans')
    const [, todo] = boardOf(context, id).columns
    const x = ticket(context, id, 'X', { column: todo.id })
    ticket(context, id, 'Y', { column: todo.id })
    const a = ticket(context, id, 'A')
    const b = ticket(context, id, 'B')
    const moved = moveTicket(
      { id: a, column: todo.id, beside: x, place: 'before' },
      context,
    )
    assert.deepEqual([moved.ok, moved.message], [true, 'Moved BEANS-3 to Todo'])
    assert.deepEqual(titles(boardOf(context, id), 1), ['Y', 'A', 'X'])
    // No anchor is the top.
    moveTicket(
      { id: b, column: todo.id, beside: null, place: 'before' },
      context,
    )
    const found = boardOf(context, id)
    assert.deepEqual(titles(found, 1), ['B', 'Y', 'A', 'X'])
    assert.deepEqual(titles(found, 0), [])
  })

  test("a move is refused for an archived ticket, another project's column, or an anchor that has left", () => {
    const context = board()
    const id = project(context, 'Beans')
    const other = project(context, 'Web')
    const [backlog, todo] = boardOf(context, id).columns
    const a = ticket(context, id, 'A')
    const b = ticket(context, id, 'B')
    const gone = ticket(context, id, 'Gone')
    archiveTicket({ id: gone, archived: true }, context)
    const elsewhere = boardOf(context, other).columns[0].id
    for (const move of [
      { id: gone, column: todo.id, beside: null },
      { id: a, column: elsewhere, beside: null },
      { id: a, column: todo.id, beside: b }, // b is in Backlog
      { id: a, column: backlog.id, beside: gone }, // archived
      { id: a, column: backlog.id, beside: a },
      { id: 999, column: backlog.id, beside: null },
    ]) {
      const refused = moveTicket({ ...move, place: 'after' }, context)
      assert.equal(refused.ok, false, JSON.stringify(move))
    }
    assert.deepEqual(titles(boardOf(context, id), 0), ['B', 'A'])
  })

  test('an update changes only the fields it names; labels replace the set', () => {
    const context = board()
    const id = project(context, 'Beans')
    const bug = label(context, null, 'bug')
    const api = label(context, id, 'api')
    const made = ticket(context, id, 'Old title', {
      labels: [bug],
      dueOn: '2026-12-01',
    })
    updateTicket({ id: made, title: 'New title', priority: 'high' }, context)
    let found = detail(context, id, 1)
    assert.deepEqual(
      [
        found.title,
        found.priority,
        found.dueOn,
        found.labels.map((each) => each.name),
      ],
      ['New title', 'high', '2026-12-01', ['bug']],
    )
    updateTicket(
      { id: made, dueOn: null, labels: [api], description: '# Why' },
      context,
    )
    found = detail(context, id, 1)
    assert.deepEqual(
      [
        found.title,
        found.dueOn,
        found.description,
        found.labels.map((each) => each.name),
      ],
      ['New title', null, '# Why', ['api']],
    )
    const web = project(context, 'Web')
    const foreign = label(context, web, 'web only')
    assert.equal(
      updateTicket({ id: made, labels: [foreign] }, context).ok,
      false,
    )
    assert.equal(updateTicket({ id: 999, title: 'x' }, context).ok, false)
  })

  test('a ticket past its due date is overdue in any column; one due today is not', () => {
    const context: BoardContext = {
      ...board(),
      now: () => new Date(2026, 10, 27, 9),
    }
    const id = project(context, 'Beans')
    const done = boardOf(context, id).columns[4].id
    ticket(context, id, 'Tomorrow', { dueOn: '2026-11-28' })
    ticket(context, id, 'Today', { dueOn: '2026-11-27' })
    ticket(context, id, 'Yesterday', { dueOn: '2026-11-26' })
    ticket(context, id, 'Done, and late', { column: done, dueOn: '2026-01-01' })
    ticket(context, id, 'No date')
    const found = boardOf(context, id)
    assert.deepEqual(
      found.columns[0].tickets.map((card) => [card.title, card.overdue]),
      [
        ['No date', false],
        ['Yesterday', true],
        ['Today', false],
        ['Tomorrow', false],
      ],
    )
    assert.equal(found.columns[4].tickets[0].overdue, true)
  })

  test('an archived ticket leaves the board for the archived list; restored, it is back on top', () => {
    const context = board()
    const id = project(context, 'Beans')
    const first = ticket(context, id, 'First')
    ticket(context, id, 'Second')
    assert.equal(
      archiveTicket({ id: first, archived: true }, context).message,
      'Archived BEANS-1',
    )
    assert.deepEqual(titles(boardOf(context, id), 0), ['Second'])
    const archived = archivedOf(context, id).tickets
    assert.deepEqual(
      archived.map((card) => [card.key, card.columnName]),
      [['BEANS-1', 'Backlog']],
    )
    assert.equal(detail(context, id, 1).archived, true)
    const overview = boardOf(context, id).project
    assert.deepEqual([overview.tickets, overview.archivedTickets], [1, 1])
    archiveTicket({ id: first, archived: false }, context)
    assert.deepEqual(titles(boardOf(context, id), 0), ['First', 'Second'])
    assert.deepEqual(archivedOf(context, id).tickets, [])
    assert.equal(readArchivedTickets(99, context), null)
  })

  test('deleting a project takes everything of its own and leaves shared labels', () => {
    const context = board()
    const id = project(context, 'Beans')
    const keep = project(context, 'Web')
    const shared = label(context, null, 'bug')
    const own = label(context, id, 'api')
    const made = ticket(context, id, 'One', { labels: [shared, own] })
    ticket(context, id, 'Two')
    saveComment({ ticket: made, body: 'A note' }, context)
    const deleted = deleteProject(id, context)
    assert.deepEqual(
      [deleted.ok, deleted.message],
      [true, 'Deleted Beans and its 2 tickets'],
    )
    const left = read(context, (db) =>
      ['board_column', 'ticket', 'ticket_label', 'comment', 'label'].map(
        (table) =>
          // A table name from this list, not input.
          db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n,
      ),
    )
    assert.deepEqual(left, [DEFAULT_COLUMNS.length, 0, 0, 0, 1])
    assert.equal(boardOf(context, keep).labels[0].name, 'bug')
    assert.equal(deleteProject(id, context).ok, false)
  })
})

describe('comments', () => {
  test('comments read oldest first; an edit marks it edited; one from another ticket is refused', () => {
    let clock = new Date('2026-11-27T10:00:00Z')
    const context: BoardContext = { ...board(), now: () => clock }
    const id = project(context, 'Beans')
    const one = ticket(context, id, 'One')
    const two = ticket(context, id, 'Two')
    saveComment({ ticket: one, body: 'First' }, context)
    saveComment({ ticket: one, body: 'Second' }, context)
    const [first] = detail(context, id, 1).comments
    assert.deepEqual(
      [first.body, first.createdAt, first.editedAt],
      ['First', '2026-11-27T10:00:00.000Z', null],
    )
    clock = new Date('2026-11-27T11:00:00Z')
    assert.equal(
      saveComment({ id: first.id, ticket: two, body: 'Hijack' }, context).ok,
      false,
    )
    assert.equal(
      saveComment({ id: first.id, ticket: one, body: 'First, fixed' }, context)
        .ok,
      true,
    )
    const comments = detail(context, id, 1).comments
    assert.deepEqual(
      comments.map((each) => [each.body, each.editedAt]),
      [
        ['First, fixed', '2026-11-27T11:00:00.000Z'],
        ['Second', null],
      ],
    )
    assert.equal(boardOf(context, id).columns[0].tickets[1].commentCount, 2)
    assert.equal(deleteComment(comments[1].id, context).ok, true)
    assert.equal(deleteComment(comments[1].id, context).ok, false)
    assert.equal(
      saveComment({ ticket: 999, body: 'Nowhere' }, context).ok,
      false,
    )
  })

  test('deleting a ticket takes its comments', () => {
    const context = board()
    const id = project(context, 'Beans')
    const made = ticket(context, id, 'One')
    saveComment({ ticket: made, body: 'A note' }, context)
    deleteTicket(made, context)
    const left = read(
      context,
      (db) => db.prepare('SELECT count(*) AS n FROM comment').get()!.n,
    )
    assert.equal(left, 0)
  })
})
