import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import type { AgentAdapter } from '../core/agents/adapter.ts'
import { claude } from '../core/agents/adapters/claude.ts'
import { opencode } from '../core/agents/adapters/opencode.ts'
import type { RunEvent, RunStepSpec } from '../core/types.ts'

// Every line of a step through one parser, as a run's read does.
function parseAll(adapter: AgentAdapter, lines: string[], step = 0) {
  const parse = adapter.parser(step)
  const events: RunEvent[] = []
  let sessionId: string | null = null
  for (const line of lines) {
    const parsed = parse(line)
    events.push(...parsed.events)
    sessionId = parsed.sessionId ?? sessionId
  }
  return { events, sessionId }
}

const step: RunStepSpec = { agent: 'claude', model: null, prompt: 'Do it' }

describe('the Claude Code adapter', () => {
  test('reads text, tool calls, the report and the cost from stream-json', () => {
    const lines = [
      '{"type":"system","subtype":"init","session_id":"abc-123","model":"claude-sonnet"}',
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Looking at the README' },
            { type: 'tool_use', name: 'Read', input: { file_path: 'README' } },
            { type: 'tool_use', name: 'Bash', input: { command: 'ls  -la' } },
            { type: 'tool_use', name: 'TodoWrite', input: { todos: [] } },
          ],
        },
      }),
      '{"type":"user","message":{"content":[{"type":"tool_result","content":"ok"}]}}',
      'not json at all',
      '{"type":"assistant","message":{"content":"a string, not blocks"}}',
      '[1, 2]',
      '{"type":"something_new","session_id":"abc-123"}',
      '',
      '{"type":"result","subtype":"success","is_error":false,"result":"All done","session_id":"abc-123","total_cost_usd":0.12}',
    ]
    assert.deepEqual(parseAll(claude, lines, 2), {
      sessionId: 'abc-123',
      events: [
        { kind: 'text', step: 2, text: 'Looking at the README' },
        { kind: 'tool', step: 2, name: 'Read', detail: 'README' },
        { kind: 'tool', step: 2, name: 'Bash', detail: 'ls -la' },
        { kind: 'tool', step: 2, name: 'TodoWrite', detail: null },
        { kind: 'report', step: 2, text: 'All done' },
        { kind: 'cost', step: 2, usd: 0.12 },
      ],
    })
  })

  test('an error result is an error event, and a second result adds only what the cost grew by', () => {
    const lines = [
      '{"type":"result","subtype":"success","is_error":false,"result":"first","total_cost_usd":0.1}',
      '{"type":"result","subtype":"error_max_turns","is_error":true,"total_cost_usd":0.25}',
    ]
    const { events } = parseAll(claude, lines)
    assert.deepEqual(events, [
      { kind: 'report', step: 0, text: 'first' },
      { kind: 'cost', step: 0, usd: 0.1 },
      { kind: 'error', step: 0, text: 'error_max_turns' },
      { kind: 'cost', step: 0, usd: 0.15 },
    ])
  })

  test('each permission level maps to its flags, the model only when given', () => {
    const argv = (
      permissions: 'read' | 'edit' | 'full',
      model = null as string | null,
    ) => claude.command({ ...step, model }, permissions).argv
    const head = ['-p', '--output-format', 'stream-json', '--verbose']
    assert.deepEqual(argv('read'), [
      ...head,
      '--permission-mode',
      'plan',
      'Do it',
    ])
    assert.deepEqual(argv('edit', 'opus'), [
      ...head,
      '--model',
      'opus',
      '--permission-mode',
      'acceptEdits',
      'Do it',
    ])
    assert.deepEqual(argv('full'), [
      ...head,
      '--dangerously-skip-permissions',
      'Do it',
    ])
    assert.deepEqual(claude.command(step, 'full').env, {})
  })

  test('a prompt that looks like a flag is kept from being read as one', () => {
    const { argv } = claude.command({ ...step, prompt: '--help me' }, 'read')
    assert.equal(argv.at(-1), ' --help me')
  })

  test('resume is claude --resume, for a session id that needs no quoting', () => {
    assert.equal(claude.resume('abc-123'), 'claude --resume abc-123')
    assert.equal(claude.resume('a; rm -rf /'), null)
  })
})

describe('the OpenCode adapter', () => {
  test('reads a real run: the tool call, the text before the stop as the report, the session', () => {
    const capture = readFileSync(
      join(import.meta.dirname, 'data', 'opencode-run.jsonl'),
      'utf8',
    ).split('\n')
    assert.deepEqual(parseAll(opencode, capture, 1), {
      sessionId: 'ses_dee07bef0ffev7wcRGamg52yjA',
      events: [
        { kind: 'tool', step: 1, name: 'read', detail: 'note.txt' },
        { kind: 'text', step: 1, text: 'hello' },
        { kind: 'report', step: 1, text: 'hello' },
      ],
    })
  })

  test('sums step costs, reports a failed tool and an error event, and skips what it cannot read', () => {
    const lines = [
      '{"type":"step_start","sessionID":"ses_1","part":{}}',
      '{"type":"text","sessionID":"ses_1","part":{"text":"Trying"}}',
      '{"type":"tool_use","sessionID":"ses_1","part":{"tool":"edit","state":{"status":"error","input":{"filePath":"a.txt"},"error":"rejected"}}}',
      '{"type":"step_finish","sessionID":"ses_1","part":{"reason":"tool-calls","cost":0.002}}',
      '{oops',
      '{"type":"error","sessionID":"ses_1","error":{"name":"APIError","data":{"message":"rate limited"}}}',
      '{"type":"text","sessionID":"ses_1","part":{"text":"Gave up"}}',
      '{"type":"step_finish","sessionID":"ses_1","part":{"reason":"stop","cost":0.003}}',
    ]
    const { events, sessionId } = parseAll(opencode, lines)
    assert.equal(sessionId, 'ses_1')
    assert.deepEqual(events, [
      { kind: 'text', step: 0, text: 'Trying' },
      { kind: 'tool', step: 0, name: 'edit', detail: 'a.txt' },
      { kind: 'error', step: 0, text: 'edit: rejected' },
      { kind: 'cost', step: 0, usd: 0.002 },
      { kind: 'error', step: 0, text: 'rate limited' },
      { kind: 'text', step: 0, text: 'Gave up' },
      { kind: 'cost', step: 0, usd: 0.003 },
      { kind: 'report', step: 0, text: 'Gave up' },
    ])
  })

  test('read and edit deny through the config and stay in the checkout, full auto-approves, all standalone', () => {
    const run = (permissions: 'read' | 'edit' | 'full') =>
      opencode.command(
        { ...step, agent: 'opencode', model: 'opencode/x-free' },
        permissions,
      )
    const head = [
      'run',
      '--standalone',
      '--format',
      'json',
      '-m',
      'opencode/x-free',
    ]
    assert.deepEqual(run('read'), {
      program: 'opencode',
      argv: [...head, 'Do it'],
      env: {
        OPENCODE_CONFIG_CONTENT:
          '{"permission":{"edit":"deny","shell":"deny","external_directory":"deny"}}',
      },
    })
    assert.deepEqual(run('edit').env, {
      OPENCODE_CONFIG_CONTENT:
        '{"permission":{"shell":"deny","external_directory":"deny"}}',
    })
    assert.deepEqual(run('full'), {
      program: 'opencode',
      argv: [...head, '--auto', 'Do it'],
      env: {},
    })
    assert.deepEqual(
      opencode.command({ ...step, agent: 'opencode' }, 'full').argv,
      ['run', '--standalone', '--format', 'json', '--auto', 'Do it'],
    )
  })

  test('resume opens the session in the TUI', () => {
    assert.equal(opencode.resume('ses_1'), 'opencode --session ses_1')
  })
})
