import assert from 'node:assert/strict'

import { attachTerminal } from '../core/terminals/sessions.ts'

// The arguments fakeSessionClaude (agent-fakes.ts) was started with, read from what it printed.
export async function sessionArgs(id: string): Promise<string[]> {
  let printed = ''
  const attached = attachTerminal(id, {
    output: (data) => {
      printed += data
    },
    exited: () => {},
  })
  assert.ok(attached !== null, `there's no session ${id}`)
  printed += attached.replay
  for (let tries = 0; !printed.includes('\nready'); tries++) {
    assert.ok(tries < 100, 'timed out waiting for the fake to print its args')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  attached.detach()
  return printed
    .replaceAll('\r', '')
    .split('\narg:')
    .slice(1)
    .map((arg) => arg.replace(/\nready[^]*$/, ''))
}

// The values that follow a flag, up to the next flag or the -- before the message.
export function valuesOf(args: string[], flag: string): string[] {
  const at = args.indexOf(flag)
  if (at === -1) return []
  const rest = args.slice(at + 1)
  const end = rest.findIndex((arg) => arg.startsWith('--'))
  return end === -1 ? rest : rest.slice(0, end)
}
