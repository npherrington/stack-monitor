// The monitor's MCP server: an agent's client starts it and talks to it over stdin and stdout, one
// JSON-RPC message a line. stdout carries protocol lines and nothing else. It ends when its stdin
// does.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import { boardContext, boardFile } from '../core/board/db.ts'
import { MCP_SERVER } from '../core/mcp-launch.ts'
import { boardTools } from './board-tools.ts'
import { answerLine, type Server } from './protocol.ts'

function packageVersion(): string {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    )
    const { version } = manifest as { version?: unknown }
    return typeof version === 'string' ? version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// The board is the file $STACK_MONITOR_BOARD names, which a session the monitor started sets to
// the monitor's own.
const server: Server = {
  name: MCP_SERVER,
  version: packageVersion(),
  tools: boardTools(boardContext(boardFile())),
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const answer = answerLine(line, server)
  if (answer !== null) process.stdout.write(`${answer}\n`)
})
