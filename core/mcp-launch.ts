// How a session the monitor starts reaches the monitor's MCP server (mcp/): the server's name, its
// tools' names, and the command Claude Code starts it with.
import { join, resolve } from 'node:path'

import { BOARD_ENV } from './board/db.ts'

export const MCP_SERVER = 'stack-monitor'

export const BOARD_TOOLS = [
  'board_list_projects',
  'board_list_tickets',
  'board_get_ticket',
  'board_create_ticket',
  'board_update_ticket',
  'board_move_ticket',
  'board_add_comment',
] as const
export type BoardTool = (typeof BOARD_TOOLS)[number]

export interface McpLaunch {
  command: string
  args: string[]
  env: Record<string, string>
}

interface Runtime {
  execPath: string
  electron: boolean
}

const MAIN = join(import.meta.dirname, '..', 'mcp', 'main.ts')

// This node running mcp/main.ts against the board file given, resolved since the server starts in
// the session's worktree. In the desktop app this node is Electron, which runs a script as plain
// Node only when told to.
export function mcpLaunch(
  boardFile: string,
  runtime: Runtime = {
    execPath: process.execPath,
    electron: process.versions.electron !== undefined,
  },
): McpLaunch {
  return {
    command: runtime.execPath,
    args: [MAIN],
    env: {
      [BOARD_ENV]: resolve(boardFile),
      ...(runtime.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    },
  }
}

// The value claude's --mcp-config takes.
export function mcpConfig(launch: McpLaunch): string {
  return JSON.stringify({ mcpServers: { [MCP_SERVER]: launch } })
}

// mcp__stack-monitor__board_get_ticket: a tool as Claude Code's permission rules name it.
export function toolRule(tool: BoardTool): string {
  return `mcp__${MCP_SERVER}__${tool}`
}
