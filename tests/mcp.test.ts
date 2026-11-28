import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { describe, test } from 'node:test'

import { BOARD_ENV, type BoardContext } from '../core/board/db.ts'
import { saveLabel } from '../core/board/labels.ts'
import { archiveProject, saveProject } from '../core/board/projects.ts'
import { readProjectBoard } from '../core/board/read.ts'
import { mcpConfig, mcpLaunch, toolRule } from '../core/mcp-launch.ts'
import { boardTools } from '../mcp/board-tools.ts'
import { answerLine, PROTOCOL_VERSIONS, type Server } from '../mcp/protocol.ts'
import { tempDir } from './fixtures.ts'

function board(): BoardContext {
  return { file: join(tempDir(), 'state', 'board.db') }
}

function serverOn(context: BoardContext): Server {
  return { name: 'stack-monitor', version: '1.2.3', tools: boardTools(context) }
}

interface Answer {
  id: unknown
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

function ask(server: Server, message: unknown): Answer {
  const line = answerLine(JSON.stringify(message), server)
  assert.ok(line !== null, 'expected an answer')
  return JSON.parse(line) as Answer
}

interface Called {
  text: string
  isError: boolean
}

// A tools/call, as the text the agent reads and whether it was a refusal.
function call(server: Server, name: string, given: unknown): Called {
  const { result } = ask(server, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: given },
  })
  assert.ok(result !== undefined, `${name} answered an error, not a result`)
  const [content] = result.content as { type: string; text: string }[]
  assert.equal(content.type, 'text')
  return { text: content.text, isError: result.isError as boolean }
}

function done(server: Server, name: string, given: unknown): string {
  const called = call(server, name, given)
  assert.equal(called.isError, false, called.text)
  return called.text
}

function beans(context: BoardContext): number {
  const saved = saveProject({ name: 'Beans', colour: null }, context)
  assert.equal(saved.ok, true, saved.message)
  return saved.id!
}

describe('the protocol', () => {
  const server = serverOn(board())
  const initialize = (protocolVersion: string) =>
    ask(server, {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: { protocolVersion, capabilities: {} },
    }).result

  test('initialize answers the version asked for when it knows it, else its newest', () => {
    assert.deepEqual(initialize('2025-03-26'), {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'stack-monitor', version: '1.2.3' },
    })
    assert.equal(
      initialize('2099-01-01')?.protocolVersion,
      PROTOCOL_VERSIONS[0],
    )
    assert.deepEqual(ask(server, { jsonrpc: '2.0', id: 'a', method: 'ping' }), {
      jsonrpc: '2.0',
      id: 'a',
      result: {},
    })
  })

  test('a notification gets no answer', () => {
    for (const line of [
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled' }),
      '   ',
    ]) {
      assert.equal(answerLine(line, server), null)
    }
  })

  test("what it can't serve is a JSON-RPC error", () => {
    const toolCall = { jsonrpc: '2.0', id: 7, method: 'tools/call' }
    for (const [line, code, id] of [
      ['{ not json', -32700, null],
      [
        JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]),
        -32600,
        null,
      ],
      [JSON.stringify({ id: 1, method: 'ping' }), -32600, null],
      [
        JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'server/discover' }),
        -32601,
        7,
      ],
      [
        JSON.stringify({ ...toolCall, params: { name: 'board_delete' } }),
        -32602,
        7,
      ],
      [JSON.stringify(toolCall), -32602, 7],
    ] as const) {
      const answered = JSON.parse(answerLine(line, server)!) as Answer
      assert.equal(answered.error?.code, code, line)
      assert.equal(answered.id, id, line)
    }
  })
})

describe('the board tools', () => {
  test("the tools are the seven board tools, each with a JSON Schema whose defaults aren't required", () => {
    const { result } = ask(serverOn(board()), {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    })
    const tools = result?.tools as {
      name: string
      description: string
      inputSchema: { type: string; required?: string[] }
    }[]
    // Nothing that deletes, archives, or starts a run, a schedule or a session.
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        'board_list_projects',
        'board_list_tickets',
        'board_get_ticket',
        'board_create_ticket',
        'board_update_ticket',
        'board_move_ticket',
        'board_add_comment',
      ],
    )
    for (const tool of tools) {
      assert.equal(tool.inputSchema.type, 'object', tool.name)
      assert.ok(tool.description.length > 20, tool.name)
    }
    const create = tools.find((tool) => tool.name === 'board_create_ticket')
    assert.deepEqual(create?.inputSchema.required, ['project', 'title'])
    assert.equal(
      toolRule('board_get_ticket'),
      'mcp__stack-monitor__board_get_ticket',
    )
  })

  test('a ticket is created, read, updated, moved and commented on by its key', () => {
    const context = board()
    const id = beans(context)
    assert.equal(
      saveLabel({ project: id, name: 'Bug', colour: 'red' }, context).ok,
      true,
    )
    const server = serverOn(context)

    assert.deepEqual(JSON.parse(done(server, 'board_list_projects', {})), [
      { name: 'Beans', prefix: 'BEANS', tickets: 0 },
    ])
    assert.equal(
      done(server, 'board_create_ticket', {
        project: 'beans',
        title: 'Roast darker',
        description: 'The **espresso** roast.',
        column: 'todo',
        colour: 'yellow',
        labels: ['bug'],
      }),
      'Created BEANS-1',
    )
    assert.equal(
      done(server, 'board_create_ticket', {
        project: 'BEANS',
        title: 'Second',
      }),
      'Created BEANS-2',
    )
    assert.equal(
      done(server, 'board_update_ticket', {
        key: 'beans-1',
        priority: 'high',
        dueOn: '2026-12-24',
      }),
      'Saved BEANS-1',
    )
    assert.equal(
      done(server, 'board_update_ticket', { key: 'BEANS-2', colour: 'green' }),
      'Saved BEANS-2',
    )
    assert.equal(
      done(server, 'board_move_ticket', {
        key: 'BEANS-1',
        column: 'in progress',
      }),
      'Moved BEANS-1 to In progress',
    )
    assert.equal(
      done(server, 'board_add_comment', { key: 'BEANS-1', body: 'Started.' }),
      'Commented on BEANS-1',
    )

    const ticket = JSON.parse(
      done(server, 'board_get_ticket', { key: 'BEANS-1' }),
    )
    assert.deepEqual(
      {
        key: ticket.key,
        title: ticket.title,
        column: ticket.column,
        priority: ticket.priority,
        colour: ticket.colour,
        dueOn: ticket.dueOn,
        labels: ticket.labels,
        description: ticket.description,
        comments: ticket.comments.map((each: { body: string }) => each.body),
      },
      {
        key: 'BEANS-1',
        title: 'Roast darker',
        column: 'In progress',
        priority: 'high',
        colour: 'yellow',
        dueOn: '2026-12-24',
        labels: ['Bug'],
        description: 'The **espresso** roast.',
        comments: ['Started.'],
      },
    )
    const listed = JSON.parse(
      done(server, 'board_list_tickets', { project: 'BEANS' }),
    )
    assert.deepEqual(
      listed.columns.map(
        (column: { name: string; tickets: { key: string }[] }) => [
          column.name,
          column.tickets.map((each) => each.key),
        ],
      ),
      [
        ['Backlog', ['BEANS-2']],
        ['Todo', []],
        ['In progress', ['BEANS-1']],
        ['In review', []],
        ['Done', []],
        ['Cancelled', []],
      ],
    )
    assert.deepEqual(
      listed.columns.flatMap(
        (column: { tickets: { key: string; colour: string | null }[] }) =>
          column.tickets.map((each) => [each.key, each.colour]),
      ),
      [
        ['BEANS-2', 'green'],
        ['BEANS-1', 'yellow'],
      ],
    )
    assert.deepEqual(listed.labels, ['Bug'])
    // A list shows no description: that is board_get_ticket's.
    assert.equal('description' in listed.columns[2].tickets[0], false)
  })

  test("a column or label the project doesn't have, and an archived project, are refused", () => {
    const context = board()
    const id = beans(context)
    const server = serverOn(context)
    done(server, 'board_create_ticket', { project: 'BEANS', title: 'One' })
    assert.deepEqual(
      call(server, 'board_move_ticket', { key: 'BEANS-1', column: 'Doing' }),
      {
        text: 'BEANS has no column "Doing". Its columns: Backlog, Todo, In progress, In review, Done, Cancelled',
        isError: true,
      },
    )
    assert.deepEqual(
      call(server, 'board_update_ticket', { key: 'BEANS-1', labels: ['Bug'] }),
      {
        text: 'BEANS has no label "Bug". It has no labels yet.',
        isError: true,
      },
    )
    archiveProject({ id, archived: true }, context)
    assert.deepEqual(JSON.parse(done(server, 'board_list_projects', {})), [])
    // Its tickets can still be read by key, and nothing writes to them.
    assert.equal(
      JSON.parse(done(server, 'board_get_ticket', { key: 'BEANS-1' })).title,
      'One',
    )
    for (const [name, given] of [
      ['board_list_tickets', { project: 'BEANS' }],
      ['board_create_ticket', { project: 'BEANS', title: 'Unseen' }],
      ['board_move_ticket', { key: 'BEANS-1', column: 'Done' }],
      ['board_update_ticket', { key: 'BEANS-1', title: 'Changed' }],
      ['board_add_comment', { key: 'BEANS-1', body: 'Hello' }],
    ] as const) {
      assert.deepEqual(call(server, name, given), {
        text: 'BEANS is archived. Restore it on the board first.',
        isError: true,
      })
    }
    const stored = readProjectBoard(id, context)
    assert.ok(stored !== null && !('problem' in stored))
    assert.equal(stored.project.tickets, 1)
  })

  test("arguments that fail a tool's schema, and a refusal from core, are isError results", () => {
    const context = board()
    beans(context)
    const server = serverOn(context)
    for (const [name, given, text] of [
      [
        'board_get_ticket',
        { key: 'three' },
        'key: A ticket id looks like BEANS-3',
      ],
      ['board_get_ticket', { key: 'BEANS-9' }, "There's no ticket BEANS-9"],
      [
        'board_get_ticket',
        undefined,
        'key: Invalid input: expected string, received undefined',
      ],
      [
        'board_list_tickets',
        { project: 'WEB' },
        "There's no project with the prefix WEB. board_list_projects lists them.",
      ],
      [
        'board_create_ticket',
        { project: 'BEANS', title: '' },
        'title: Give it a title',
      ],
      [
        'board_create_ticket',
        { project: 'BEANS', title: 'One', id: 4 },
        'arguments: Unrecognized key: "id"',
      ],
      [
        'board_update_ticket',
        { key: 'BEANS-1' },
        'Name a field to change: title, description, priority, dueOn, colour or labels',
      ],
      [
        'board_add_comment',
        { key: 'BEANS-1', body: ' ' },
        'body: Write something first',
      ],
    ] as const) {
      assert.deepEqual(call(server, name, given), { text, isError: true }, name)
    }
  })
})

describe('the launch', () => {
  test('the launch names this node and mcp/main.ts, the board file resolved, and ELECTRON_RUN_AS_NODE only under Electron', () => {
    const main = resolve(import.meta.dirname, '..', 'mcp', 'main.ts')
    assert.deepEqual(
      mcpLaunch('state/board.db', { execPath: '/bin/node', electron: false }),
      {
        command: '/bin/node',
        args: [main],
        env: { [BOARD_ENV]: resolve('state/board.db') },
      },
    )
    const electron = mcpLaunch('/b.db', { execPath: '/E', electron: true })
    assert.deepEqual(electron.env, {
      [BOARD_ENV]: '/b.db',
      ELECTRON_RUN_AS_NODE: '1',
    })
    assert.deepEqual(JSON.parse(mcpConfig(electron)), {
      mcpServers: { 'stack-monitor': electron },
    })
    assert.equal(mcpLaunch('/b.db').command, process.execPath)
  })

  test('the server answers each stdin line with one JSON line, against the board its environment names', async () => {
    const context = board()
    const id = beans(context)
    const launch = mcpLaunch(context.file)
    const child = spawn(launch.command, launch.args, {
      env: { ...process.env, ...launch.env },
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    const lines: string[] = []
    createInterface({ input: child.stdout }).on('line', (line) =>
      lines.push(line),
    )
    const exited = new Promise<number | null>((ended) =>
      child.on('exit', ended),
    )
    for (const message of [
      { jsonrpc: '2.0', id: 'probe', method: 'server/discover' },
      {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25' },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'board_create_ticket',
          arguments: { project: 'BEANS', title: 'From the server' },
        },
      },
    ]) {
      child.stdin.write(`${JSON.stringify(message)}\n`)
    }
    child.stdin.end()
    assert.equal(await exited, 0)

    const answers = lines.map((line) => JSON.parse(line) as Answer)
    assert.deepEqual(
      answers.map((each) => each.id),
      ['probe', 0, 1, 2],
    )
    assert.equal(answers[0].error?.code, -32601)
    assert.equal(answers[1].result?.protocolVersion, '2025-11-25')
    assert.equal((answers[2].result!.tools as unknown[]).length, 7)
    assert.deepEqual(answers[3].result, {
      content: [{ type: 'text', text: 'Created BEANS-1' }],
      isError: false,
    })
    const stored = readProjectBoard(id, context)
    assert.ok(stored !== null && !('problem' in stored))
    assert.equal(stored.columns[0].tickets[0].title, 'From the server')
  })
})
