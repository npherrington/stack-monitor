// Claude Code 2.1: `claude -p` with stream-json, one JSON object a line.
import type { RunEvent, RunPermissions } from '../../types.ts'
import {
  jsonObject,
  promptArgument,
  record,
  SESSION_ID,
  text,
  toolDetail,
  type AgentAdapter,
  type LineParser,
} from '../adapter.ts'

// plan reads and answers; acceptEdits changes files and is refused anything that would need a
// prompt (a shell command), which a headless run can't give.
const PERMISSION_ARGS: Record<RunPermissions, string[]> = {
  read: ['--permission-mode', 'plan'],
  edit: ['--permission-mode', 'acceptEdits'],
  full: ['--dangerously-skip-permissions'],
}

// One step's stream. total_cost_usd is the session's running total, so a second result line adds
// only what it grew by.
function claudeParser(step: number): LineParser {
  let costSoFar = 0
  return (line) => {
    const event = jsonObject(line)
    if (event === null) return { events: [], sessionId: null }
    const sessionId = text(event.session_id)
    const events: RunEvent[] = []
    if (event.type === 'assistant') {
      const content = record(event.message).content
      for (const block of Array.isArray(content) ? content : []) {
        const { type, name, input, text: said } = record(block)
        if (type === 'text' && typeof said === 'string' && said.trim()) {
          events.push({ kind: 'text', step, text: said })
        }
        if (type === 'tool_use' && typeof name === 'string') {
          events.push({ kind: 'tool', step, name, detail: toolDetail(input) })
        }
      }
    }
    if (event.type === 'result') {
      const said = text(event.result)
      const subtype = text(event.subtype) ?? ''
      if (event.is_error === true || subtype.startsWith('error')) {
        events.push({ kind: 'error', step, text: said || subtype || 'error' })
      } else if (said) {
        events.push({ kind: 'report', step, text: said })
      }
      const total = event.total_cost_usd
      if (typeof total === 'number' && total >= costSoFar) {
        events.push({ kind: 'cost', step, usd: total - costSoFar })
        costSoFar = total
      }
    }
    return { events, sessionId }
  }
}

export const claude: AgentAdapter = {
  id: 'claude',
  label: 'Claude Code',
  program: 'claude',
  can: { effort: true, cost: true, resume: true },
  install: 'npm install -g @anthropic-ai/claude-code',
  login: {
    command: 'claude',
    note: "Checking the login would start a session, so it isn't read. Run claude once: it asks you to log in when it needs to.",
  },
  models: () => Promise.resolve(['sonnet', 'opus', 'haiku']),
  command: (step, permissions) => ({
    program: 'claude',
    argv: [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      ...(step.model === null ? [] : ['--model', step.model]),
      ...PERMISSION_ARGS[permissions],
      promptArgument(step.prompt),
    ],
    env: {},
  }),
  parser: claudeParser,
  resume: (sessionId) =>
    SESSION_ID.test(sessionId) ? `claude --resume ${sessionId}` : null,
}
