// Claude Code's own saved workflows: .claude/workflows/<name>.js, a script for the Workflow tool,
// found by its `export const meta`. A repo can add a launcher beside it, as Latitude does: a
// <name>.json manifest and an executable <name>.sh that readies the checkout and then starts
// claude. Listing reads files and runs nothing.
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import { describeIssues } from '../config/load.ts'
import { PathText } from '../repos.ts'
import { run } from '../run.ts'
import type { Tracking } from '../settings.ts'
import {
  errorMessage,
  failure,
  type ClaudeWorkflow,
  type RunPermissions,
  type StartRunResult,
} from '../types.ts'
import { ADAPTERS } from './adapters/index.ts'
import { findProgram } from './detect.ts'
import { readMetaLiteral } from './meta-literal.ts'
import { runsDir, type Meta } from './run-files.ts'
import {
  beginRun,
  PermissionsSchema,
  repoOfCheckout,
  type RunOptions,
} from './runs.ts'
import { readAgentSettings } from './settings.ts'

export const CLAUDE_WORKFLOWS_DIR = '.claude/workflows'
const NAME = /^[a-z][a-z0-9-]{1,39}$/
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
// In print mode claude stops waiting on a background workflow after this; a workflow takes hours.
const WAIT_CEILING_MS = String(3 * 60 * 60 * 1000)
const TICKET = /^[A-Za-z][A-Za-z0-9]*-\d+$/

// Latitude's manifest (.claude/workflows/README.md there), every field but label and description
// optional so a lighter one works too.
const Manifest = z.object({
  label: z.string().min(1).max(60),
  description: z.string().min(1).max(600),
  argument: z.enum(['none', 'ticket', 'tickets', 'text']).default('none'),
  argumentLabel: z.string().min(1).max(40).nullable().default(null),
  testRun: z.boolean().default(false),
  sessions: z.enum(['one', 'many']).default('one'),
  cost: z.string().min(1).max(300).nullable().default(null),
  effort: z.enum(EFFORTS).nullable().default(null),
})
type Manifest = z.output<typeof Manifest>

export const RunClaudeWorkflowSchema = z.strictObject({
  checkout: PathText,
  name: z.string().regex(NAME, 'must be a workflow name'),
  testRun: z.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
  argument: z.string().trim().max(500).optional(),
  permissions: PermissionsSchema.optional(), // a script's run; a launcher sets its own
})

interface Problem {
  file: string
  problem: string
}

function isExecutable(path: string): boolean {
  try {
    const stat = statSync(path)
    return stat.isFile() && (stat.mode & 0o111) !== 0
  } catch {
    return false
  }
}

function readManifest(path: string): Manifest | { problem: string } {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return { problem: `isn't readable JSON: ${errorMessage(error)}` }
  }
  const parsed = Manifest.safeParse(raw)
  return parsed.success
    ? parsed.data
    : { problem: describeIssues(parsed.error.issues) }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

// What a checkout's .claude/workflows holds: each script, and each launcher with or without one.
export function listClaudeWorkflows(root: string): {
  claude: ClaudeWorkflow[]
  problems: Problem[]
} {
  const dir = join(root, CLAUDE_WORKFLOWS_DIR)
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return { claude: [], problems: [] }
  }
  const has = new Set(files)
  const names = new Set(
    files
      .filter((file) => file.endsWith('.js') || file.endsWith('.json'))
      .map((file) => file.replace(/\.(js|json)$/, '')),
  )
  const claude: ClaudeWorkflow[] = []
  const problems: Problem[] = []
  for (const name of [...names].toSorted()) {
    const where = (ext: string) => `${CLAUDE_WORKFLOWS_DIR}/${name}.${ext}`
    let description: string | null = null
    let phases: string[] = []
    if (has.has(`${name}.js`)) {
      let meta
      try {
        meta = readMetaLiteral(readFileSync(join(dir, `${name}.js`), 'utf8'))
      } catch (error) {
        meta = { problem: `isn't readable: ${errorMessage(error)}` }
      }
      if ('problem' in meta) {
        problems.push({ file: where('js'), problem: String(meta.problem) })
        continue
      }
      if (meta.name !== name) {
        problems.push({
          file: where('js'),
          problem: `its meta.name is ${JSON.stringify(meta.name)}, not ${name}`,
        })
        continue
      }
      description = text(meta.description)
      phases = Array.isArray(meta.phases)
        ? meta.phases.flatMap((phase) => {
            const title =
              typeof phase === 'object' &&
              phase !== null &&
              !Array.isArray(phase)
                ? text(phase.title)
                : null
            return title === null ? [] : [title]
          })
        : []
    }
    const launcher = has.has(`${name}.json`) && has.has(`${name}.sh`)
    if (!launcher) {
      // A .json alone is some other file (a queue's state, say), unless a .sh says it's a manifest.
      if (!has.has(`${name}.js`)) continue
      claude.push({
        name,
        launcher: false,
        label: name,
        description: description ?? '',
        phases,
        cost: null,
        effort: null,
        testRun: false,
        argument: 'none',
        argumentLabel: null,
      })
      continue
    }
    if (!NAME.test(name)) {
      problems.push({
        file: where('json'),
        problem: 'the name must be 2 to 40 lowercase letters, digits and -',
      })
      continue
    }
    const manifest = readManifest(join(dir, `${name}.json`))
    if ('problem' in manifest) {
      problems.push({ file: where('json'), problem: manifest.problem })
      continue
    }
    if (!isExecutable(join(dir, `${name}.sh`))) {
      problems.push({ file: where('sh'), problem: "isn't executable" })
      continue
    }
    claude.push({
      name,
      launcher: true,
      label: manifest.label,
      description: manifest.description,
      phases,
      cost: manifest.cost,
      effort: manifest.effort,
      testRun: manifest.testRun,
      argument: manifest.argument,
      argumentLabel: manifest.argumentLabel,
    })
  }
  return { claude, problems }
}

// The monitor runs only a launcher git has at the checkout's HEAD, unchanged: what was reviewed.
async function committedUnchanged(
  checkout: string,
  file: string,
): Promise<boolean> {
  const tracked = await run('git', [
    '-C',
    checkout,
    'ls-files',
    '--error-unmatch',
    '--',
    file,
  ])
  if (tracked.code !== 0) return false
  const changed = await run('git', [
    '-C',
    checkout,
    'status',
    '--porcelain',
    '--',
    file,
  ])
  return changed.code === 0 && changed.stdout.trim() === ''
}

function refused(message: string): StartRunResult {
  return { ...failure(message), runId: null }
}

// The launcher's arguments after its options: ticket ids, or --arg=<text>.
function argumentArgs(
  workflow: ClaudeWorkflow,
  given: string | undefined,
): string[] | { refused: string } {
  const value = given ?? ''
  if (workflow.argument === 'none') return []
  const what = workflow.argumentLabel ?? workflow.argument
  if (value === '') return { refused: `${workflow.label} needs ${what}` }
  if (workflow.argument === 'text') {
    return value.includes('\n')
      ? { refused: `${what} is one line` }
      : [`--arg=${value}`]
  }
  const ids = value.split(/[\s,]+/).filter(Boolean)
  const most = workflow.argument === 'ticket' ? 1 : 10
  if (ids.length > most || !ids.every((id) => TICKET.test(id))) {
    return {
      refused: `${what} takes ${most === 1 ? 'one ticket id' : 'one to ten ticket ids'}, like ABC-123`,
    }
  }
  return ids
}

function scriptPrompt(name: string, notes: string | undefined): string {
  const args = notes ? `, args: ${JSON.stringify({ notes })}` : ''
  return `Run the saved workflow named ${name} with the Workflow tool${args}. Don't do any of its stages yourself. When it finishes, report its outcome and anything it made: PR links, tickets, files.`
}

export async function runClaudeWorkflow(
  tracking: Tracking,
  request: z.output<typeof RunClaudeWorkflowSchema>,
  { dir = runsDir(), env = process.env }: RunOptions = {},
): Promise<StartRunResult> {
  const repo = await repoOfCheckout(tracking, request.checkout)
  if ('refused' in repo) return refused(repo.refused)
  const { root, checkout } = repo
  const workflow = listClaudeWorkflows(checkout).claude.find(
    (each) => each.name === request.name,
  )
  if (workflow === undefined) {
    return refused(
      `${checkout} has no Claude Code workflow ${request.name} in ${CLAUDE_WORKFLOWS_DIR}`,
    )
  }
  const settings = readAgentSettings(tracking.settings)
  if ('problem' in settings) return refused(settings.problem)
  const program = await findProgram(ADAPTERS.claude, settings, env)
  if (program === null) {
    return refused(
      `Claude Code isn't installed on this machine. Install it with ${ADAPTERS.claude.install}`,
    )
  }
  const notes = request.notes || undefined
  let step: Meta['steps'][number]
  let permissions: RunPermissions = 'full'
  if (workflow.launcher) {
    const file = `${CLAUDE_WORKFLOWS_DIR}/${workflow.name}.sh`
    if (!(await committedUnchanged(checkout, file))) {
      return refused(
        `${file} isn't committed unchanged in ${checkout}. The monitor runs only a launcher at HEAD as it was committed.`,
      )
    }
    const argument = argumentArgs(workflow, request.argument)
    if ('refused' in argument) return refused(argument.refused)
    const testRun = workflow.testRun && request.testRun === true
    const manifest = readManifest(
      join(checkout, CLAUDE_WORKFLOWS_DIR, `${workflow.name}.json`),
    )
    const sessions = 'problem' in manifest ? 'one' : manifest.sessions
    const argv = [
      ...(testRun ? ['--no-publish'] : []),
      ...(workflow.effort === null ? [] : [`--effort=${workflow.effort}`]),
      ...(notes === undefined ? [] : [`--notes=${notes}`]),
      ...argument,
      // claude's own flags, which a one-session launcher passes on as they are.
      ...(sessions === 'one'
        ? [
            '--',
            '-p',
            '--session-id',
            randomUUID(),
            '-n',
            workflow.label,
            '--output-format',
            'stream-json',
            '--verbose',
          ]
        : []),
    ]
    step = {
      agent: 'claude',
      model: null,
      title: testRun ? `${workflow.label} (test run)` : workflow.label,
      prompt: `${file} ${argv.join(' ')}`,
      launcher: true,
      command: {
        program: join(checkout, file),
        argv,
        // The launcher finds claude on PATH; put the one the monitor found first.
        env: {
          PATH: `${join(program, '..')}:${env.PATH ?? ''}`,
          CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: WAIT_CEILING_MS,
        },
      },
    }
  } else {
    if (request.argument) {
      return refused(`${workflow.name} takes notes, not an argument`)
    }
    const prompt = scriptPrompt(workflow.name, notes)
    permissions = request.permissions ?? 'full'
    const command = ADAPTERS.claude.command(
      { agent: 'claude', model: null, prompt },
      permissions,
    )
    step = {
      agent: 'claude',
      model: null,
      title: workflow.name,
      prompt,
      command: {
        program,
        argv: command.argv,
        env: {
          ...command.env,
          CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: WAIT_CEILING_MS,
        },
      },
    }
  }
  return beginRun(dir, {
    kind: 'workflow',
    title: step.title ?? workflow.name,
    root,
    checkout,
    permissions,
    steps: [step],
  })
}
