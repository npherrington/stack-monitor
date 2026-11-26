// GET /api/terminals/socket?id=: a page's view of one terminal. The server sends what `claude`
// prints as text frames, first the scrollback and then live; the page sends TerminalInput as JSON.
// The socket closes with 4000 when `claude` exits, its reason the exit code, and 4004 for no such
// session.
import { WebSocketServer } from 'ws'

import { attachTerminal, TerminalInput } from '../core/terminals/sessions.ts'
import type { Upgrade } from './http.ts'

export const EXITED = 4000
export const NO_SESSION = 4004

const sockets = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 })

export const terminalSocket: Upgrade = (req, socket, head, url) => {
  sockets.handleUpgrade(req, socket, head, (ws) => {
    const attached = attachTerminal(url.searchParams.get('id') ?? '', {
      output: (data) => ws.send(data),
      exited: (code) => ws.close(EXITED, String(code)),
    })
    if (attached === null) {
      ws.close(NO_SESSION, 'No such terminal')
      return
    }
    if (attached.replay !== '') ws.send(attached.replay)
    if (attached.exitCode !== null) {
      ws.close(EXITED, String(attached.exitCode))
      attached.detach()
      return
    }
    ws.on('message', (message, isBinary) => {
      if (isBinary) return
      let input: unknown
      try {
        input = JSON.parse(String(message))
      } catch {
        return
      }
      const parsed = TerminalInput.safeParse(input)
      if (parsed.success) attached.send(parsed.data)
    })
    ws.on('close', attached.detach)
  })
}
