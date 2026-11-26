import assert from 'node:assert/strict'
import { chmodSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import WebSocket from 'ws'

import { writeJsonFile } from '../core/settings.ts'
import type { TerminalSession, TerminalsSnapshot } from '../core/types.ts'
import type { Serving } from '../server/http.ts'
import { startMonitor } from '../server/monitor.ts'
import { git, gitRepo, tempDir } from './fixtures.ts'
import { send, sendJson } from './http-client.ts'

// Stands in for `claude`: says where it runs, then answers each line it's sent.
function fakeClaude(dir: string): string {
  const path = join(dir, 'fake-claude')
  writeFileSync(
    path,
    '#!/bin/sh\necho "cwd=$(pwd)"\necho "args=$*"\nwhile read line; do echo "got:$line"; done\n',
  )
  chmodSync(path, 0o755)
  return path
}

// Stands in for the user's $SHELL.
function fakeShell(dir: string): string {
  const path = join(dir, 'fake-shell')
  writeFileSync(
    path,
    '#!/bin/sh\necho "shell cwd=$(pwd) args=$*"\nwhile read line; do echo "sh:$line"; done\n',
  )
  chmodSync(path, 0o755)
  return path
}

interface Watching {
  socket: WebSocket
  output: () => string
  closed: Promise<{ code: number; reason: string }>
}

function watch(port: number, id: string, origin?: string): Watching {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/api/terminals/socket?id=${id}`,
    origin === undefined ? {} : { origin },
  )
  let text = ''
  socket.on('message', (data) => {
    text += String(data)
  })
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    socket.on('close', (code, reason) =>
      resolve({ code, reason: String(reason) }),
    ),
  )
  return { socket, output: () => text, closed }
}

async function until(check: () => boolean, what: string): Promise<void> {
  for (let tries = 0; tries < 100; tries++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail(`Timed out waiting for ${what}`)
}

// The upgrade's answer: 'open', or the status it was refused with.
function upgrade(port: number, id: string, origin?: string): Promise<string> {
  return new Promise((resolve) => {
    const { socket } = watch(port, id, origin)
    socket.on('open', () => {
      socket.close()
      resolve('open')
    })
    socket.on('unexpected-response', (_request, response) =>
      resolve(String(response.statusCode)),
    )
  })
}

describe('the terminal routes', () => {
  let monitor: Serving
  let primary: string
  let linked: string
  let page: string // the Origin the page sends
  const shell = process.env.SHELL

  before(async () => {
    const root = tempDir()
    process.env.SHELL = fakeShell(root)
    primary = gitRepo(join(root, 'app'))
    linked = join(root, 'app-wt1')
    git(primary, 'worktree', 'add', '-q', '-b', 'feature', linked)
    const settings = join(root, 'config', '.monitor.json')
    writeJsonFile(settings, {
      repos: [{ root: primary, name: 'app' }],
      agents: { agents: { claude: { program: fakeClaude(root) } } },
    })
    monitor = await startMonitor({
      port: 0,
      seed: primary,
      settings,
      dist: join(root, 'dist'),
      unbuilt: '',
    })
    page = `http://127.0.0.1:${monitor.port}`
  })
  after(() => {
    process.env.SHELL = shell
    return monitor.stop()
  })

  const open = async (path: string, kind?: 'shell') => {
    const answer = await sendJson(monitor.port, '/api/terminals', {
      root: primary,
      path,
      ...(kind === undefined ? {} : { kind }),
    })
    return { status: answer.status, body: JSON.parse(answer.text) }
  }

  test('refuses a folder that is not one of the repo’s worktrees', async () => {
    const { status, body } = await open(tempDir())
    assert.equal(status, 409)
    assert.match(body.message, /isn't a worktree of/)
  })

  test('runs claude in the worktree, and the page talks to it over the socket', async () => {
    const { status, body } = await open(linked)
    assert.equal(status, 200)
    const session = body as TerminalSession
    assert.equal(session.kind, 'claude')
    assert.equal(session.exitCode, null)
    assert.equal((await open(linked)).body.id, session.id, 'one per worktree')

    const watching = watch(monitor.port, session.id, page)
    await until(
      () => watching.output().includes(`cwd=${realpathSync(linked)}`),
      'the fake to say where it runs',
    )
    await until(
      () =>
        watching
          .output()
          .includes(
            'args=--settings {"theme":"light-ansi","spinnerVerbs":{"mode":"replace","verbs":["Gnawing",',
          ),
      'claude to be started in the light-ansi theme, with beaver verbs',
    )
    watching.socket.send(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }))
    watching.socket.send(JSON.stringify({ type: 'input', data: 'hello\r' }))
    await until(
      () => watching.output().includes('got:hello'),
      'the typed line to reach it',
    )

    // Another page attaching is first sent what was printed before it came.
    const late = watch(monitor.port, session.id, page)
    await until(() => late.output().includes('got:hello'), 'the replay')
    late.socket.close()

    const closed = await sendJson(monitor.port, '/api/terminals/close', {
      id: session.id,
    })
    assert.equal(closed.status, 200)
    assert.equal((await watching.closed).code, 4000)
    const listed = await send(monitor.port, { path: '/api/terminals' })
    assert.deepEqual(
      (JSON.parse(listed.text) as TerminalsSnapshot).sessions,
      [],
    )
  })

  test('runs the user’s login shell in the worktree, beside its claude', async () => {
    const claude = (await open(linked)).body as TerminalSession
    const { status, body } = await open(linked, 'shell')
    assert.equal(status, 200)
    const session = body as TerminalSession
    assert.equal(session.kind, 'shell')
    assert.notEqual(session.id, claude.id)
    const another = (await open(linked, 'shell')).body as TerminalSession
    assert.notEqual(another.id, session.id, 'a new shell each time')

    const watching = watch(monitor.port, session.id, page)
    await until(
      () =>
        watching.output().includes(`shell cwd=${realpathSync(linked)} args=-l`),
      'the shell to start in the worktree',
    )
    watching.socket.send(JSON.stringify({ type: 'input', data: 'ls\r' }))
    await until(() => watching.output().includes('sh:ls'), 'the typed line')
    for (const id of [session.id, another.id, claude.id]) {
      await sendJson(monitor.port, '/api/terminals/close', { id })
    }
  })

  test('opens a socket only for the page’s own origin', async () => {
    const { body } = await open(primary)
    const id = (body as TerminalSession).id
    assert.equal(await upgrade(monitor.port, id, page), 'open')
    assert.equal(await upgrade(monitor.port, id, 'http://evil.test'), '403')
    assert.equal(await upgrade(monitor.port, id), '403')
    await sendJson(monitor.port, '/api/terminals/close', { id })
  })

  test('closes a socket for a session that does not exist', async () => {
    const watching = watch(monitor.port, 'nope', page)
    assert.equal((await watching.closed).code, 4004)
  })
})
