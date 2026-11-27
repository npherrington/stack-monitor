import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { BOARD_ENV } from '../core/board/db.ts'
import type { Serving } from '../server/http.ts'
import { startMonitor } from '../server/monitor.ts'
import { gitRepo, tempDir } from './fixtures.ts'
import { send, sendJson } from './http-client.ts'

// A monitor whose board is the file given, stopped by the caller.
async function monitorWith(file: string): Promise<Serving> {
  const root = tempDir()
  process.env[BOARD_ENV] = file
  return startMonitor({
    port: 0,
    seed: gitRepo(join(root, 'app')),
    settings: join(root, 'config', '.monitor.json'),
    dist: join(root, 'dist'),
    unbuilt: '',
  })
}

describe('the board routes', () => {
  let monitor: Serving
  let broken: Serving
  const saved = {
    config: process.env.STACK_MONITOR_CONFIG,
    board: process.env[BOARD_ENV],
  }

  before(async () => {
    delete process.env.STACK_MONITOR_CONFIG
    const notes = join(tempDir(), 'board.db')
    writeFileSync(notes, 'Not a database, just my notes.\n'.repeat(40))
    broken = await monitorWith(notes)
    monitor = await monitorWith(join(tempDir(), 'board.db'))
  })
  after(async () => {
    await monitor.stop()
    await broken.stop()
    for (const [key, value] of [
      ['STACK_MONITOR_CONFIG', saved.config],
      [BOARD_ENV, saved.board],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  const get = async (path: string, from = monitor) => {
    const answer = await send(from.port, {
      path,
      headers: { host: `127.0.0.1:${from.port}` },
    })
    return { status: answer.status, body: JSON.parse(answer.text) }
  }
  const post = async (path: string, value: unknown, from = monitor) => {
    const answer = await sendJson(from.port, path, value, {
      host: `127.0.0.1:${from.port}`,
    })
    return { status: answer.status, body: JSON.parse(answer.text) }
  }

  test('a project, a ticket, a move and a comment, read back over HTTP', async () => {
    assert.deepEqual(await get('/api/board'), {
      status: 200,
      body: { projects: [] },
    })
    assert.deepEqual(
      await post('/api/board/projects/save', { name: 'Beans', colour: 'teal' }),
      {
        status: 200,
        body: { ok: true, message: 'Created Beans', log: null, id: 1 },
      },
    )
    assert.deepEqual((await get('/api/board')).body.projects, [
      {
        id: 1,
        name: 'Beans',
        prefix: 'BEANS',
        colour: 'teal',
        archived: false,
        tickets: 0,
        archivedTickets: 0,
      },
    ])
    assert.deepEqual(
      await post('/api/board/tickets/create', {
        project: 1,
        title: 'Roast them',
        priority: 'high',
      }),
      {
        status: 200,
        body: { ok: true, message: 'Created BEANS-1', log: null, number: 1 },
      },
    )
    const { columns } = (await get('/api/board/project?id=1')).body
    const [backlog, todo] = columns
    assert.deepEqual(backlog.tickets, [
      {
        id: 1,
        number: 1,
        key: 'BEANS-1',
        title: 'Roast them',
        column: backlog.id,
        priority: 'high',
        dueOn: null,
        overdue: false,
        labels: [],
        commentCount: 0,
      },
    ])
    assert.equal(
      (
        await post('/api/board/tickets/move', {
          id: 1,
          column: todo.id,
          beside: null,
          place: 'before',
        })
      ).status,
      200,
    )
    assert.equal(
      (
        await post('/api/board/comments/save', {
          ticket: 1,
          body: 'Dark roast',
        })
      ).status,
      200,
    )
    const ticket = await get('/api/board/ticket?project=1&number=1')
    assert.equal(ticket.status, 200)
    assert.deepEqual(
      [
        ticket.body.column,
        ticket.body.description,
        ticket.body.archived,
        ticket.body.comments.map((each: { body: string }) => each.body),
      ],
      [todo.id, '', false, ['Dark roast']],
    )
    assert.deepEqual(await get('/api/board/archived?project=1'), {
      status: 200,
      body: { tickets: [] },
    })
  })

  test('a body that fails its schema is a 400 naming the field', async () => {
    const extra = await post('/api/board/projects/save', {
      name: 'Web',
      owner: 'me',
    })
    assert.equal(extra.status, 400)
    assert.match(
      extra.body.message,
      /Expected \{ id\?, name, prefix\?, colour\? \}/,
    )
    const colour = await post('/api/board/labels/save', {
      project: null,
      name: 'bug',
      colour: '#ff0000',
    })
    assert.equal(colour.status, 400)
    assert.match(colour.body.message, /colour/)
    assert.equal((await get('/api/board/project?id=beans')).status, 400)
  })

  test("a refusal is a 409 with core's message", async () => {
    assert.deepEqual(
      await post('/api/board/projects/save', {
        name: 'Beans again',
        prefix: 'BEANS',
      }),
      {
        status: 409,
        body: {
          ok: false,
          message: "BEANS is Beans's prefix. Choose another.",
          log: null,
          id: null,
        },
      },
    )
  })

  test("a project or ticket that isn't there is a 404", async () => {
    assert.deepEqual(await get('/api/board/project?id=99'), {
      status: 404,
      body: { ok: false, message: "There's no project 99", log: null },
    })
    assert.deepEqual(await get('/api/board/ticket?project=1&number=99'), {
      status: 404,
      body: {
        ok: false,
        message: "There's no ticket 99 in that project",
        log: null,
      },
    })
    assert.equal((await get('/api/board/archived?project=99')).status, 404)
  })

  test("a file that isn't a board: a read answers 500 with the problem, a write 409 with it", async () => {
    const read = await get('/api/board', broken)
    assert.equal(read.status, 500)
    assert.match(read.body.message, /doesn't read as a board/)
    const write = await post(
      '/api/board/projects/save',
      { name: 'Beans' },
      broken,
    )
    assert.equal(write.status, 409)
    assert.match(write.body.message, /doesn't read as a board/)
  })
})
