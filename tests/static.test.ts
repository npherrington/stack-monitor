import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { serve, type Serving } from '../server/http.ts'
import { tempDir } from './fixtures.ts'
import { send } from './http-client.ts'

async function servePage(dist: string): Promise<Serving> {
  return serve({
    port: 0,
    page: { dist, unbuilt: 'Build it first' },
    routes: {},
    maxBodyBytes: 1,
  })
}

describe('the page', () => {
  let built: Serving
  let unbuilt: Serving
  let root: string

  before(async () => {
    root = tempDir()
    const dist = join(root, 'dist')
    mkdirSync(join(dist, 'assets'), { recursive: true })
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>t</title>')
    writeFileSync(join(dist, 'assets', 'app.js'), 'export {}')
    writeFileSync(join(root, 'secret.txt'), 'not for the page')
    built = await servePage(dist)
    unbuilt = await servePage(join(root, 'missing'))
  })
  after(() => Promise.all([built.stop(), unbuilt.stop()]))

  const get = (server: Serving, path: string) =>
    send(server.port, { path, headers: { host: `127.0.0.1:${server.port}` } })

  test('serves index.html at / under the page policy', async () => {
    const answer = await get(built, '/')
    assert.equal(answer.status, 200)
    assert.match(answer.headers['content-type'] ?? '', /^text\/html/)
    assert.match(
      String(answer.headers['content-security-policy']),
      /script-src 'self'/,
    )
  })

  test('serves the built files with their types', async () => {
    const answer = await get(built, '/assets/app.js')
    assert.equal(answer.status, 200)
    assert.match(answer.headers['content-type'] ?? '', /^text\/javascript/)
  })

  test('never serves a file from outside dist', async () => {
    for (const path of [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/assets/../../secret.txt',
    ]) {
      const answer = await get(built, path)
      assert.equal(answer.status, 404, path)
      assert.doesNotMatch(answer.text, /not for the page/)
    }
  })

  test('says how to build the page while dist is missing', async () => {
    const answer = await get(unbuilt, '/')
    assert.equal(answer.status, 503)
    assert.equal(answer.text, 'Build it first')
  })
})
