import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'

import type { z } from 'zod'

import { errorMessage, failure } from '../core/types.ts'
import { serveStatic, type Page } from './static.ts'

export type Reply = [status: number, body: unknown]
// raw: the query's fields for a GET, the parsed JSON body for anything else.
export type Route = (raw: unknown) => Promise<Reply>
export type Routes = Record<string, Route> // by "METHOD /path"
// A WebSocket route, handed the upgrade once its Host and Origin pass.
export type Upgrade = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  url: URL,
) => void
export type Upgrades = Record<string, Upgrade> // by path

export interface ServeOptions {
  port: number // 0 for one the system picks
  page: Page
  routes: Routes
  maxBodyBytes: number // of the largest body a route takes
  upgrades?: Upgrades
}

export interface Serving {
  port: number // the one it listens on, which Host and Origin must name
  // Stops listening, then resolves once the requests already in flight have been answered.
  stop: () => Promise<void>
}

// A route that only ever sees input of the shape it declares; anything else is a 400.
export function route<Input>(
  input: z.ZodType<Input>,
  expects: string,
  answer: (input: Input) => Promise<Reply>,
): Route {
  return async (raw) => {
    const parsed = input.safeParse(raw)
    if (parsed.success) return answer(parsed.data)
    const [issue] = parsed.error.issues
    const field = issue.path.join('.') || 'body'
    return [400, failure(`Expected ${expects}: ${field}: ${issue.message}`)]
  }
}

function allowedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`]
}

// Where the page is served from. A webview with an origin of its own would be added here.
function allowedOrigins(port: number): string[] {
  return allowedHosts(port).map((host) => `http://${host}`)
}

// Any page open in the browser can send requests to localhost. The Host check stops DNS
// rebinding. A browser names the sending page in Origin on every POST and on every cross-origin
// fetch whose answer a page could read. A JSON content type can't be sent cross-origin without a
// CORS preflight, which this server never answers.
function rejectReason(req: IncomingMessage, port: number): string | null {
  if (!allowedHosts(port).includes(req.headers.host ?? '')) {
    return 'Host not allowed'
  }
  const { origin } = req.headers
  if (origin !== undefined && !allowedOrigins(port).includes(origin)) {
    return 'Origin not allowed'
  }
  if (req.method === 'GET' || req.method === 'HEAD') return null
  const [mediaType] = (req.headers['content-type'] ?? '').split(';')
  if (mediaType.trim().toLowerCase() !== 'application/json') {
    return 'Content-Type must be application/json'
  }
  return null
}

// A browser always names the page opening a WebSocket, so one without an Origin isn't the page.
function rejectUpgrade(req: IncomingMessage, port: number): string | null {
  if (!allowedHosts(port).includes(req.headers.host ?? '')) {
    return 'Host not allowed'
  }
  const { origin } = req.headers
  if (origin === undefined || !allowedOrigins(port).includes(origin)) {
    return 'Origin not allowed'
  }
  return null
}

function refuseUpgrade(socket: Duplex, status: string): void {
  socket.end(
    `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  )
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readJson(
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ value: unknown } | { error: string }> {
  const chunks: Buffer[] = []
  let size = 0
  // Read to its end even once it's over: leaving the loop destroys the request, and the client,
  // still sending, would meet a closed connection before it reads why.
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size <= maxBytes) chunks.push(chunk)
  }
  if (size > maxBytes) return { error: 'Request body is too large' }
  try {
    return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { error: "Request body isn't JSON" }
  }
}

async function respond(
  req: IncomingMessage,
  res: ServerResponse,
  { page, routes, maxBodyBytes }: ServeOptions,
  port: number,
): Promise<void> {
  const reason = rejectReason(req, port)
  if (reason !== null) {
    sendJson(res, 403, failure(reason))
    return
  }
  const url = URL.parse(req.url ?? '/', 'http://localhost')
  if (url === null) {
    sendJson(res, 400, failure("The request URL isn't valid"))
    return
  }
  const name = `${req.method} ${url.pathname}`
  if (Object.hasOwn(routes, name)) {
    const input =
      req.method === 'GET'
        ? { value: Object.fromEntries(url.searchParams) }
        : await readJson(req, maxBodyBytes)
    if ('error' in input) {
      sendJson(res, 400, failure(input.error))
      return
    }
    const [status, body] = await routes[name](input.value)
    sendJson(res, status, body)
    return
  }
  const isRead = req.method === 'GET' || req.method === 'HEAD'
  if (isRead && !url.pathname.startsWith('/api/')) {
    await serveStatic(page, url.pathname, res)
    return
  }
  sendJson(res, 404, failure(`No route for ${name}`))
}

// Resolves once it's listening on 127.0.0.1, and rejects when the port can't be had.
export function serve(options: ServeOptions): Promise<Serving> {
  let port = options.port
  const server = createServer((req, res) => {
    // A framed copy would take a click on Stop with the Origin check none the wiser.
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // Keeps another origin's page from loading a status or a log as an image or a script.
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    respond(req, res, options, port).catch((error: unknown) => {
      console.error(error)
      if (res.headersSent) {
        res.destroy()
        return
      }
      const message = errorMessage(error)
      sendJson(res, 500, failure(`The monitor hit an error: ${message}`))
    })
  })
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (rejectUpgrade(req, port) !== null) {
      refuseUpgrade(socket, '403 Forbidden')
      return
    }
    const url = URL.parse(req.url ?? '/', 'http://localhost')
    const upgrade =
      url !== null && Object.hasOwn(options.upgrades ?? {}, url.pathname)
        ? options.upgrades?.[url.pathname]
        : undefined
    if (url === null || upgrade === undefined) {
      refuseUpgrade(socket, '404 Not Found')
      return
    }
    upgrade(req, socket, head, url)
  })
  const stop = () =>
    new Promise<void>((stopped) => {
      server.close(() => stopped())
    })
  return new Promise((listening, refused) => {
    server.once('error', refused)
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', refused)
      port = (server.address() as AddressInfo).port
      listening({ port, stop })
    })
  })
}
