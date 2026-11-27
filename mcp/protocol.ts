// MCP for a server that offers tools and nothing else: JSON-RPC 2.0, one message a line. Pure, so
// a test feeds it lines; mcp/main.ts joins it to stdin and stdout
// (docs/decisions/mcp-stdio-by-hand.md).

// Newest first. A client that asks for one of these gets it; any other gets the newest.
export const PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const

export interface ToolResult {
  text: string
  isError: boolean
}

export interface Tool {
  name: string
  description: string
  inputSchema: unknown // JSON Schema
  call: (given: unknown) => ToolResult
}

export interface Server {
  name: string
  version: string
  tools: readonly Tool[]
}

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

type Id = string | number | null

function failed(id: Id, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
}

function answered(id: Id, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function fields(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function callTool(id: Id, params: unknown, server: Server): string {
  const { name, arguments: given } = fields(params)
  const tool = server.tools.find((each) => each.name === name)
  if (tool === undefined) {
    return failed(id, INVALID_PARAMS, `Unknown tool: ${String(name)}`)
  }
  let result: ToolResult
  try {
    result = tool.call(given ?? {})
  } catch (error) {
    result = {
      text: error instanceof Error ? error.message : String(error),
      isError: true,
    }
  }
  // A tool that refuses answers a result the agent can read and correct itself from, not a
  // protocol error.
  return answered(id, {
    content: [{ type: 'text', text: result.text }],
    isError: result.isError,
  })
}

// One line of stdin in, the line to write back out; null when there is nothing to say (a
// notification, a blank line).
export function answerLine(line: string, server: Server): string | null {
  if (line.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return failed(null, PARSE_ERROR, 'Parse error')
  }
  const { jsonrpc, id, method, params } = fields(parsed)
  if (jsonrpc !== '2.0' || typeof method !== 'string') {
    return failed(null, INVALID_REQUEST, 'Invalid Request')
  }
  if (id === undefined) return null
  if (typeof id !== 'string' && typeof id !== 'number') {
    return failed(null, INVALID_REQUEST, 'Invalid Request')
  }
  switch (method) {
    case 'initialize': {
      const asked = fields(params).protocolVersion
      const known = PROTOCOL_VERSIONS.find((version) => version === asked)
      return answered(id, {
        protocolVersion: known ?? PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: server.name, version: server.version },
      })
    }
    case 'ping':
      return answered(id, {})
    case 'tools/list':
      return answered(id, {
        tools: server.tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      })
    case 'tools/call':
      return callTool(id, params, server)
    default:
      return failed(id, METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}
