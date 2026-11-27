// `claude`, or the user's shell, in a terminal of its own for each worktree, which the page's Terminal panel attaches
// to over a WebSocket. The sessions live in the monitor, so a closed panel or a reloaded page
// comes back to the same one; quitting the monitor ends them (their terminals close, so each gets
// SIGHUP).
import { randomUUID } from 'node:crypto'

import { spawn, type IPty } from 'node-pty'
import { z } from 'zod'

import { ADAPTERS } from '../agents/adapters/index.ts'
import { findProgram } from '../agents/detect.ts'
import { readAgentSettings } from '../agents/settings.ts'
import { trackedRepo } from '../config/sections.ts'
import { mcpConfig, type McpLaunch } from '../mcp-launch.ts'
import { PathText } from '../repos.ts'
import type { Tracking } from '../settings.ts'
import {
  failure,
  type ActionResult,
  type SessionTaskKind,
  type TerminalSession,
} from '../types.ts'
import { canonical, listWorktrees } from '../worktrees/clone.ts'

export const OpenTerminalRequest = z.strictObject({
  root: PathText,
  path: PathText,
  kind: z.enum(['claude', 'shell']).default('claude'),
})
export const TerminalIdRequest = z.strictObject({
  id: z.string().min(1).max(64),
})

// What a page sends down the socket: keys typed, or the size its terminal now has.
export const TerminalInput = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('input'), data: z.string().max(65_536) }),
  z.strictObject({
    type: z.literal('resize'),
    cols: z.int().min(2).max(1000),
    rows: z.int().min(2).max(1000),
  }),
])
export type TerminalInput = z.output<typeof TerminalInput>

// Enough for a page that reattaches to redraw what was on screen and some history above it.
const SCROLLBACK_CHARS = 256 * 1024

// The page is light, and its terminal sets the 16 ANSI colours from the app's theme. Claude
// Code's light-ansi theme draws only in those, so it follows the app; its other themes paint some
// bars in fixed colours. Set for these sessions only, over whatever theme the user picked, with
// the monitor's beaver doing the work on the spinner line.
const CLAUDE_ARGS = [
  '--settings',
  JSON.stringify({
    theme: 'light-ansi',
    spinnerVerbs: {
      mode: 'replace',
      verbs: [
        'Gnawing',
        'Dam-building',
        'Felling',
        'Whittling',
        'Log-rolling',
        'Paddling',
        'Tail-slapping',
        'Stacking sticks',
        'Damming',
        'Lodge-building',
        'Chewing it over',
        'Nibbling',
        'Burrowing',
        'Mudding the lodge',
        'Beavering away',
      ],
    },
  }),
]

// What a session is started to do. Only core passes one: the page sends ids and choices, and the
// monitor writes the message.
export interface SessionTask {
  kind: SessionTaskKind
  title: string
  message: string // the session's first message
  systemPrompt?: string // appended to Claude Code's own
  mcp?: McpLaunch // for a session that uses the monitor's tools
  allowedTools?: readonly string[] // permission rules that run without asking
}

// What a task adds to claude's argv. --mcp-config and --allowedTools each take as many values as
// follow them, so the message goes last, after --.
export function taskArgs(task: SessionTask): string[] {
  return [
    ...(task.systemPrompt === undefined
      ? []
      : ['--append-system-prompt', task.systemPrompt]),
    ...(task.mcp === undefined ? [] : ['--mcp-config', mcpConfig(task.mcp)]),
    ...(task.allowedTools === undefined || task.allowedTools.length === 0
      ? []
      : ['--allowedTools', ...task.allowedTools]),
    '--',
    task.message,
  ]
}

export interface Viewer {
  output: (data: string) => void
  exited: (code: number) => void
}

interface Session extends TerminalSession {
  pty: IPty
  scrollback: string
  viewers: Set<Viewer>
}

const sessions = new Map<string, Session>()

function summary({
  id,
  kind,
  root,
  path,
  startedAt,
  exitCode,
  title,
  task,
}: Session): TerminalSession {
  return { id, kind, root, path, startedAt, exitCode, title, task }
}

function liveClaudeIn(path: string): Session | undefined {
  const wanted = canonical(path)
  return [...sessions.values()].find(
    (each) =>
      each.kind === 'claude' &&
      each.exitCode === null &&
      canonical(each.path) === wanted,
  )
}

// The live claude session in a worktree, which can't be handed a task.
export function claudeOpenIn(path: string): TerminalSession | undefined {
  const running = liveClaudeIn(path)
  return running === undefined ? undefined : summary(running)
}

export function alreadyOpen(path: string): string {
  return `Claude Code is already open in ${path}. Close that session or pick another checkout: a session can't be given a task once it has started.`
}

// A login shell, so it has the PATH and prompt a new Terminal window would.
function shellProgram(): { program: string; args: string[] } {
  return { program: process.env.SHELL || '/bin/zsh', args: ['-l'] }
}

async function claudeProgram(
  tracking: Tracking,
): Promise<{ program: string; args: string[] } | ActionResult> {
  const settings = readAgentSettings(tracking.settings)
  if ('problem' in settings) return failure(settings.problem)
  const program = await findProgram(ADAPTERS.claude, settings)
  if (program === null) {
    return failure(
      "Claude Code isn't on the monitor's PATH. Install it, or set its program in Settings › Agents.",
    )
  }
  return { program, args: CLAUDE_ARGS }
}

export function listTerminals(): TerminalSession[] {
  return [...sessions.values()].map(summary)
}

// The worktree's running `claude`, or a new one started in it; a shell is new each time, as a
// new Terminal tab is. With a task, claude starts on it, and a worktree that already has claude
// open is refused.
export async function openTerminal(
  tracking: Tracking,
  request: z.output<typeof OpenTerminalRequest>,
  task?: SessionTask,
): Promise<TerminalSession | ActionResult> {
  const repo = trackedRepo(tracking, request.root)
  if ('problem' in repo) return failure(repo.problem)
  if ('refused' in repo) return failure(repo.refused)
  const wanted = canonical(request.path)
  const worktree = (await listWorktrees(repo.root)).find(
    (each) => canonical(each.path) === wanted,
  )
  if (worktree === undefined) {
    return failure(`${request.path} isn't a worktree of ${repo.root}`)
  }
  if (worktree.prunable) {
    return failure(
      `${worktree.path} is gone: git still lists it, but its folder isn't there`,
    )
  }
  const kind = task === undefined ? request.kind : 'claude'
  const running = kind === 'claude' ? liveClaudeIn(worktree.path) : undefined
  if (running !== undefined) {
    return task === undefined
      ? summary(running)
      : failure(alreadyOpen(worktree.path))
  }

  const command =
    kind === 'shell' ? shellProgram() : await claudeProgram(tracking)
  if ('ok' in command) return command
  const { program } = command
  const args =
    task === undefined ? command.args : [...command.args, ...taskArgs(task)]
  let pty: IPty
  try {
    pty = spawn(program, args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: worktree.path,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    })
  } catch (error) {
    return failure(`Couldn't start ${program}: ${(error as Error).message}`)
  }
  const session: Session = {
    id: randomUUID(),
    kind,
    root: repo.root,
    path: worktree.path,
    startedAt: new Date().toISOString(),
    exitCode: null,
    title: task?.title ?? null,
    task: task?.kind ?? null,
    pty,
    scrollback: '',
    viewers: new Set(),
  }
  pty.onData((data) => {
    session.scrollback = (session.scrollback + data).slice(-SCROLLBACK_CHARS)
    for (const viewer of session.viewers) viewer.output(data)
  })
  pty.onExit(({ exitCode }) => {
    session.exitCode = exitCode
    for (const viewer of session.viewers) viewer.exited(exitCode)
  })
  sessions.set(session.id, session)
  return summary(session)
}

// Ends a session's program (SIGHUP, as closing a terminal window does) and forgets it.
export function closeTerminal(id: string): ActionResult {
  const session = sessions.get(id)
  if (session === undefined) return failure(`There's no terminal ${id}`)
  sessions.delete(id)
  if (session.exitCode === null) session.pty.kill('SIGHUP')
  return { ok: true, message: 'Closed the terminal', log: null }
}

export interface Attached {
  replay: string // what it printed before, to draw first
  exitCode: number | null
  send: (input: TerminalInput) => void
  detach: () => void
}

// A page watching a session: it's sent what its program prints from here on, and its keys and size
// go to the terminal.
export function attachTerminal(id: string, viewer: Viewer): Attached | null {
  const session = sessions.get(id)
  if (session === undefined) return null
  session.viewers.add(viewer)
  return {
    replay: session.scrollback,
    exitCode: session.exitCode,
    send: (input) => {
      if (session.exitCode !== null) return
      if (input.type === 'input') session.pty.write(input.data)
      else session.pty.resize(input.cols, input.rows)
    },
    detach: () => session.viewers.delete(viewer),
  }
}
