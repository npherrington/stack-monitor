// OpenCode 2.3: `opencode run --format json`, one JSON event a line, each with its sessionID.
import { run } from '../../run.ts'
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

// How OpenCode 2.3.0 behaved, tried with opencode/deepseek-v4.1-flash-free in a scratch repo:
// - Its permissions allow everything by default, so `run` without --auto edits files and runs
//   shell commands; --auto only adds approving what the config sets to "ask".
// - A rule set to "ask" doesn't hang a run: it's rejected ("This non-interactive run cannot ask the
//   user for permission") and the model carries on. A "deny" takes the tool away altogether.
// - `run` hands the session to a shared background service, which never reads this process's
//   environment. --standalone runs a private server in the process tree instead: it reads
//   OPENCODE_CONFIG_CONTENT, and the launcher's SIGTERM to the step's group reaches it.
// - Files outside the session's folder are readable unless external_directory is denied; denied, a
//   read there fails with "Permission denied: external_directory".
// So read and edit deny what they leave out, and keep the run inside its checkout, through
// OPENCODE_CONFIG_CONTENT, which is merged over the user's own config; full adds --auto, so a run
// never stops at an ask.
const PERMISSION_CONFIG: Record<RunPermissions, object | null> = {
  read: {
    permission: { edit: 'deny', shell: 'deny', external_directory: 'deny' },
  },
  edit: { permission: { shell: 'deny', external_directory: 'deny' } },
  full: null,
}

const MODELS_TTL_MS = 5 * 60_000
const modelsCache = new Map<string, { at: number; models: string[] }>()

// `opencode models`: one provider/model a line, local ollama/* ones included.
async function listModels(program: string): Promise<string[]> {
  const cached = modelsCache.get(program)
  if (cached !== undefined && Date.now() - cached.at < MODELS_TTL_MS) {
    return cached.models
  }
  const listed = await run(program, ['models'], { timeoutMs: 10_000 })
  if (listed.code !== 0) return []
  const models = listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[\w.-]+\/\S+$/.test(line))
  modelsCache.set(program, { at: Date.now(), models })
  return models
}

function errorText(event: Record<string, unknown>): string {
  const error = record(event.error)
  return (
    text(record(error.data).message) ??
    text(error.message) ??
    text(error.name) ??
    'OpenCode reported an error'
  )
}

// The report is the last text before the step_finish whose reason is stop: the turn's end, where
// tool-calls means it goes on.
function opencodeParser(step: number): LineParser {
  let lastText: string | null = null
  return (line) => {
    const event = jsonObject(line)
    if (event === null) return { events: [], sessionId: null }
    const sessionId = text(event.sessionID)
    const part = record(event.part)
    const events: RunEvent[] = []
    if (event.type === 'text') {
      const said = text(part.text)
      if (said?.trim()) {
        events.push({ kind: 'text', step, text: said })
        lastText = said
      }
    }
    if (event.type === 'tool_use') {
      const name = text(part.tool) ?? 'tool'
      const state = record(part.state)
      events.push({ kind: 'tool', step, name, detail: toolDetail(state.input) })
      if (state.status === 'error') {
        const why = text(state.error) ?? text(state.output)
        if (why) events.push({ kind: 'error', step, text: `${name}: ${why}` })
      }
    }
    if (event.type === 'step_finish') {
      if (typeof part.cost === 'number' && part.cost > 0) {
        events.push({ kind: 'cost', step, usd: part.cost })
      }
      if (part.reason === 'stop' && lastText !== null) {
        events.push({ kind: 'report', step, text: lastText })
      }
    }
    if (event.type === 'error') {
      events.push({ kind: 'error', step, text: errorText(event) })
    }
    return { events, sessionId }
  }
}

export const opencode: AgentAdapter = {
  id: 'opencode',
  label: 'OpenCode',
  program: 'opencode',
  can: { effort: false, cost: true, resume: true },
  install: 'brew install sst/tap/opencode',
  login: {
    command: 'opencode auth login',
    note: 'Free opencode/* and ollama/* models need no login',
  },
  models: listModels,
  command: (step, permissions) => {
    const config = PERMISSION_CONFIG[permissions]
    const env: Record<string, string> = {}
    if (config !== null) env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config)
    return {
      program: 'opencode',
      argv: [
        'run',
        '--standalone',
        '--format',
        'json',
        ...(step.model === null ? [] : ['-m', step.model]),
        ...(permissions === 'full' ? ['--auto'] : []),
        promptArgument(step.prompt),
      ],
      env,
    }
  },
  parser: opencodeParser,
  resume: (sessionId) =>
    SESSION_ID.test(sessionId) ? `opencode --session ${sessionId}` : null,
}
