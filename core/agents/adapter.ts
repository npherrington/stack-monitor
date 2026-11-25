// What differs between coding-agent CLIs, behind one interface: how to run one headless, how to
// read what it prints, and how to pick its session up again.
import type {
  AgentCapabilities,
  AgentId,
  RunEvent,
  RunPermissions,
  RunStepSpec,
} from '../types.ts'

// A step as the launcher runs it: spawned with no shell, env added to the monitor's own.
export interface AgentCommand {
  program: string
  argv: string[]
  env: Record<string, string>
}

// One line of a step's stdout, as common events.
export interface ParsedLine {
  events: RunEvent[]
  sessionId: string | null // the session the line names, when it names one
}

// Made once per step file and fed its lines in order, so an adapter can carry what a later line
// needs (OpenCode's report is the text before its last step ends).
export type LineParser = (line: string) => ParsedLine

export interface AgentAdapter {
  id: AgentId
  label: string
  program: string // the name looked for on PATH
  can: AgentCapabilities
  install: string
  login: { command: string; note: string | null }
  // Offered in the run form. program: where it was found.
  models(program: string): Promise<string[]>
  // argv[0] is not the program: the launcher spawns `program` with argv.
  command(step: RunStepSpec, permissions: RunPermissions): AgentCommand
  parser(step: number): LineParser
  resume(sessionId: string): string | null
}

// What the page shows for a tool call: the first input field that says what it acted on.
const DETAIL_KEYS = [
  'description',
  'command',
  'file_path',
  'filePath',
  'path',
  'pattern',
  'url',
  'query',
  'skill',
]
const DETAIL_CHARS = 200

export function toolDetail(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null
  const fields = input as Record<string, unknown>
  for (const key of DETAIL_KEYS) {
    const value = fields[key]
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim().replace(/\s+/g, ' ').slice(0, DETAIL_CHARS)
    }
  }
  return null
}

// A JSON object, or null for a line that isn't one (a CLI's own chatter, a half-written line).
export function jsonObject(line: string): Record<string, unknown> | null {
  if (line.trim() === '') return null
  try {
    const value: unknown = JSON.parse(line)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

// The prompt goes last as a positional argument. One starting with `-` would be read as a flag, so
// it gets a leading space, which the model reads past.
export function promptArgument(prompt: string): string {
  return prompt.startsWith('-') ? ` ${prompt}` : prompt
}

// A session id the page can put in a command without quoting.
export const SESSION_ID = /^[\w-]{1,128}$/
