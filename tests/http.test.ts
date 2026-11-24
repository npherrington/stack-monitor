import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { z } from 'zod'

import { route, serve, type Serving } from '../server/http.ts'
import { tempDir } from './fixtures.ts'
import { send, sendJson } from './http-client.ts'

const MAX_BODY_BYTES = 256

describe('the HTTP layer', () => {
  let server: Serving
  let host: string

  before(async () => {
    server = await serve({
      port: 0,
      page: { dist: tempDir(), unbuilt: 'unbuilt' },
      maxBodyBytes: MAX_BODY_BYTES,
      routes: {
        'GET /api/echo': async (raw) => [200, raw],
        'POST /api/echo': route(
          z.object({ name: z.string() }),
          'a name',
          async (input) => [200, input],
        ),
      },
    })
    host = `127.0.0.1:${server.port}`
  })
  after(() => server.stop())

  test('answers a GET with its query fields', async () => {
    const answer = await send(server.port, {
      path: '/api/echo?a=1',
      headers: { host },
    })
    assert.equal(answer.status, 200)
    assert.deepEqual(JSON.parse(answer.text), { a: '1' })
    assert.equal(answer.headers['cache-control'], 'no-store')
  })

  test('sends the headers that keep other pages from framing or loading it', async () => {
    const { headers } = await send(server.port, {
      path: '/api/echo',
      headers: { host },
    })
    assert.equal(headers['x-frame-options'], 'DENY')
    assert.equal(headers['x-content-type-options'], 'nosniff')
    assert.equal(headers['cross-origin-resource-policy'], 'same-origin')
  })

  test('refuses a Host that is not localhost on its port', async () => {
    for (const bad of ['evil.example', `127.0.0.1:${server.port + 1}`]) {
      const answer = await send(server.port, {
        path: '/api/echo',
        headers: { host: bad },
      })
      assert.equal(answer.status, 403)
      assert.equal(JSON.parse(answer.text).message, 'Host not allowed')
    }
    const localhost = `localhost:${server.port}`
    assert.equal(
      (
        await send(server.port, {
          path: '/api/echo',
          headers: { host: localhost },
        })
      ).status,
      200,
    )
  })

  test("refuses an Origin that isn't the page's", async () => {
    const answer = await send(server.port, {
      path: '/api/echo',
      headers: { host, origin: 'http://evil.example' },
    })
    assert.equal(answer.status, 403)
    assert.equal(JSON.parse(answer.text).message, 'Origin not allowed')
  })

  test('takes a POST only as JSON', async () => {
    const answer = await send(server.port, {
      method: 'POST',
      path: '/api/echo',
      headers: { host, 'content-type': 'text/plain' },
      body: '{"name":"x"}',
    })
    assert.equal(answer.status, 403)
    assert.equal(
      JSON.parse(answer.text).message,
      'Content-Type must be application/json',
    )
  })

  test('answers a body of the wrong shape with a 400 naming the field', async () => {
    const answer = await sendJson(
      server.port,
      '/api/echo',
      { name: 7 },
      { host },
    )
    assert.equal(answer.status, 400)
    assert.match(JSON.parse(answer.text).message, /^Expected a name: name: /)
  })

  test('refuses a body over the size cap', async () => {
    const answer = await sendJson(
      server.port,
      '/api/echo',
      { name: 'x'.repeat(MAX_BODY_BYTES) },
      { host },
    )
    assert.equal(answer.status, 400)
    assert.equal(JSON.parse(answer.text).message, 'Request body is too large')
  })

  test('answers an /api path with no route with a 404', async () => {
    const answer = await send(server.port, {
      path: '/api/nothing',
      headers: { host },
    })
    assert.equal(answer.status, 404)
    assert.deepEqual(JSON.parse(answer.text), {
      ok: false,
      message: 'No route for GET /api/nothing',
      log: null,
    })
  })
})
