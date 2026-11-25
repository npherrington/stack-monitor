import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { MONITOR_HOME } from '../core/monitor-address.ts'
import { launchMonitor } from '../server/launch.ts'
import { gitRepo, tempDir } from './fixtures.ts'

// Another copy of the monitor (an older one inside another repo): the same health, no home.
function otherMonitor(): Promise<{ server: Server; port: number }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        app: 'stack-monitor',
        root: '/elsewhere/latitude',
        pid: 1,
      }),
    )
  })
  return new Promise((ready) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      ready({
        server,
        port:
          typeof address === 'object' && address !== null ? address.port : 0,
      })
    }),
  )
}

describe('launching beside a monitor already on the port', () => {
  let other: { server: Server; port: number }
  let repo: string
  const page = { dist: tempDir(), unbuilt: 'unbuilt' }
  const closing: (() => Promise<void>)[] = []

  before(async () => {
    other = await otherMonitor()
    repo = gitRepo(join(tempDir(), 'app'))
    process.env.STACK_MONITOR_PORT = String(other.port)
    process.env.STACK_MONITOR_SETTINGS = join(tempDir(), '.monitor.json')
    process.env.STACK_MONITOR_SCHEDULES = join(tempDir(), 'schedules')
  })

  after(async () => {
    for (const close of closing) await close()
    other.server.close()
    delete process.env.STACK_MONITOR_PORT
    delete process.env.STACK_MONITOR_SETTINGS
    delete process.env.STACK_MONITOR_SCHEDULES
  })

  test("doesn't take a different monitor for this one", async () => {
    const launched = await launchMonitor(page, repo)
    assert.ok('error' in launched)
    assert.match(
      launched.error,
      /a different stack monitor, for \/elsewhere\/latitude/,
    )
  })

  test('with fallback, starts on the next free port', async () => {
    const launched = await launchMonitor(page, repo, { fallback: true })
    assert.ok(
      'started' in launched && launched.started,
      JSON.stringify(launched),
    )
    closing.push(() => launched.serving.stop())
    assert.notEqual(launched.url, `http://127.0.0.1:${other.port}`)
    // And a second launch finds that one, this monitor, and shows it rather than starting again.
    process.env.STACK_MONITOR_PORT = launched.url.split(':').pop()
    const again = await launchMonitor(page, repo)
    assert.ok('started' in again && !again.started)
    assert.equal(again.running.home, MONITOR_HOME)
    process.env.STACK_MONITOR_PORT = String(other.port)
  })
})
