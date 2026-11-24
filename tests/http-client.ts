// A bare HTTP client for tests of the monitor's server: it sends the path and the headers exactly
// as given, where fetch would tidy a `..` out of the path and refuse to set Host.
import {
  Agent,
  createServer,
  request,
  type IncomingHttpHeaders,
} from 'node:http'
import type { AddressInfo } from 'node:net'

export interface Answer {
  status: number
  headers: IncomingHttpHeaders
  text: string
  body: Buffer
}

interface Sent {
  method?: string
  path?: string
  headers?: Record<string, string>
  body?: string | Buffer
  // Keeps the connection open while the answer is read, as a browser does. Without it the server
  // closes on answering, and an answer sent before the whole body was read can be lost to the reset.
  keepAlive?: boolean
}

export function send(
  port: number,
  {
    method = 'GET',
    path = '/',
    headers = {},
    body,
    keepAlive = false,
  }: Sent = {},
): Promise<Answer> {
  const agent = keepAlive ? new Agent({ keepAlive: true }) : false
  return new Promise<Answer>((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method, path, headers, agent },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('error', reject)
        res.on('end', () => {
          const whole = Buffer.concat(chunks)
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: whole.toString('utf8'),
            body: whole,
          })
        })
      },
    )
    req.on('error', reject)
    req.end(body)
  }).finally(() => {
    if (agent) agent.destroy()
  })
}

export function sendJson(
  port: number,
  path: string,
  value: unknown,
  headers: Record<string, string> = {},
): Promise<Answer> {
  return send(port, {
    method: 'POST',
    path,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(value),
  })
}

// A port nothing listens on: taken from the system, then let go.
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })
}
