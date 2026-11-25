// stack-monitor.json: what a repo tells the monitor about itself. Each section is a module, off
// when it's left out, except worktrees and featureMap, which are always on.
import { z } from 'zod'

import type { Modules } from '../types.ts'

export const INDEX = '{index}'
export const DEFAULT_MAINLINE = 'origin/main'

// Handed to git as an argument, so it can't start with '-'.
const Ref = z
  .string()
  .regex(/^\w[\w./-]*$/, 'must be a git ref such as origin/main')

// Run with /bin/sh -c in the checkout. {index} stands for the worktree's index.
const Command = z.string().min(1).max(2000)

// Read in each checkout, so relative to its root and inside it.
const RepoPath = z
  .string()
  .min(1)
  .refine(
    (path) => !path.startsWith('/') && !path.split('/').includes('..'),
    'must be a path inside the checkout, without ..',
  )

const EnvKey = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be an environment variable name')

export const Name = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,23}$/,
    'must be up to 24 lowercase letters, digits and -, starting with a letter',
  )

function compiles(source: string): boolean {
  try {
    new RegExp(source)
    return true
  } catch {
    return false
  }
}

const Pattern = z
  .string()
  .min(1)
  .refine(compiles, "isn't a valid regular expression")

const PortStatus = z
  .strictObject({
    file: RepoPath.optional().describe(
      'The env file setup writes the port into',
    ),
    key: EnvKey.optional().describe('The port’s key in that file'),
    base: z
      .int()
      .min(1)
      .max(65535)
      .optional()
      .describe(
        'The port. With worktrees.index, base + the worktree’s index, so each worktree gets its own; create checks it is free before it makes a worktree',
      ),
  })
  .refine(
    (port) => (port.file === undefined) === (port.key === undefined),
    'file and key go together',
  )
  .refine(
    (port) => port.file !== undefined || port.base !== undefined,
    'needs file and key, or base',
  )

const ComposeStatus = z.strictObject({
  project: z
    .string()
    .min(1)
    .optional()
    .describe('The compose project; {index} allowed'),
  parts: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'The compose services it runs as. Some of them up reads as half up',
    ),
})

const ProcessStatus = z.strictObject({
  match: z.string().min(1).describe('Text its command line contains'),
  owner: z
    .enum(['cwd', 'argument'])
    .default('cwd')
    .describe(
      'How it belongs to a checkout: its working directory is inside it, or a path in its arguments is',
    ),
})

const Status = z
  .strictObject({
    port: PortStatus.optional().describe(
      'Up when something working inside the checkout listens on the port',
    ),
    compose: ComposeStatus.optional().describe(
      'Up when the containers whose compose labels point inside the checkout are running',
    ),
    process: ProcessStatus.optional().describe(
      'Up when a matching process belongs to the checkout',
    ),
    command: Command.optional().describe('Up when this exits 0'),
  })
  .refine(
    (status) =>
      Object.values(status).filter((kind) => kind !== undefined).length === 1,
    'needs exactly one of port, compose, process or command',
  )

export const Service = z
  .strictObject({
    start: Command.describe('Starts it, run detached in the checkout'),
    stop: Command.optional().describe(
      'Stops it. Without one, a stop sends SIGTERM to what status found, or docker stop to its containers',
    ),
    status: Status,
    oneShot: z
      .boolean()
      .default(false)
      .describe(
        'start exits once the service is up, and its exit code is the answer',
      ),
    needs: z.array(Name).default([]).describe('Services started before it'),
    ready: Pattern.optional().describe(
      "A line in start's output that says it's up, for a service status alone can't tell",
    ),
  })
  .refine((service) => !(service.oneShot && service.ready !== undefined), {
    message: "a oneShot service's exit says it's up, so it takes no ready",
    path: ['ready'],
  })

export const Stack = z.strictObject({
  services: z
    .record(Name, Service)
    .refine(
      (services) => Object.keys(services).length > 0,
      'declare at least one service',
    ),
  startAll: z
    .array(Name)
    .optional()
    .describe('What Start all starts, in order. Default: every service'),
  shared: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(40),
        url: z
          .url({ protocol: /^https?$/ })
          .describe('Answers 2xx while it is up'),
      }),
    )
    .default([])
    .describe(
      'Servers one machine runs for every checkout: shown, never stopped',
    ),
})

const Worktrees = z.strictObject({
  index: z
    .strictObject({
      file: RepoPath,
      key: EnvKey,
      max: z.int().min(1).max(999).default(99),
    })
    .optional()
    .describe(
      "Where a worktree's number is kept, for a repo that gives each worktree its own ports",
    ),
  setup: Command.optional().describe(
    'Run in a new worktree after git worktree add. A failure takes the worktree back',
  ),
  install: Command.optional().describe(
    'Installs dependencies, in the background once setup is done',
  ),
  teardown: Command.optional().describe(
    'Run before git worktree remove. A failure stops the removal',
  ),
})

// The adapters there are. core/agents/ will own this list.
export const AGENT_IDS = ['claude'] as const

const Agents = z.strictObject({
  default: z.enum(AGENT_IDS).default('claude'),
  env: z
    .record(EnvKey, z.string())
    .default({})
    .describe('Added to the environment of every run'),
  arguments: z
    .record(Name, Pattern)
    .default({})
    .describe("Patterns a run's argument is checked against, by name"),
  workflows: RepoPath.optional().describe('The folder of saved workflows'),
})

const FeatureMap = z.strictObject({
  blocks: RepoPath.optional().describe(
    "The repo's own blocks, added to the built-in ones",
  ),
})

const ConfigObject = z.strictObject({
  $schema: z.string().optional(),
  mainline: Ref.default(DEFAULT_MAINLINE).describe(
    'The ref branches are compared against and cut from',
  ),
  worktrees: Worktrees.prefault({}),
  stack: Stack.optional(),
  agents: Agents.optional(),
  featureMap: FeatureMap.prefault({}),
})

type ConfigShape = z.output<typeof ConfigObject>
type StackShape = z.output<typeof Stack>

interface Problem {
  path: (string | number)[]
  message: string
}

// The first loop in the services' needs, as the names round it, or null. A service that needs
// itself is reported on its own.
function needsLoop(services: StackShape['services']): string[] | null {
  const clear = new Set<string>()
  const visit = (name: string, trail: string[]): string[] | null => {
    if (trail.includes(name)) return [...trail.slice(trail.indexOf(name)), name]
    if (clear.has(name) || !Object.hasOwn(services, name)) return null
    for (const need of services[name].needs) {
      if (need === name) continue
      const loop = visit(need, [...trail, name])
      if (loop !== null) return loop
    }
    clear.add(name)
    return null
  }
  for (const name of Object.keys(services)) {
    const loop = visit(name, [])
    if (loop !== null) return loop
  }
  return null
}

function stackProblems(stack: StackShape): Problem[] {
  const declared = (name: string) => Object.hasOwn(stack.services, name)
  const problems: Problem[] = []
  for (const [name, service] of Object.entries(stack.services)) {
    service.needs.forEach((need, at) => {
      const path = ['stack', 'services', name, 'needs', at]
      if (need === name) {
        problems.push({ path, message: `${name} can't need itself` })
      } else if (!declared(need)) {
        problems.push({ path, message: `${need} isn't one of the services` })
      }
    })
  }
  stack.startAll?.forEach((name, at) => {
    if (!declared(name)) {
      problems.push({
        path: ['stack', 'startAll', at],
        message: `${name} isn't one of the services`,
      })
    }
  })
  const loop = needsLoop(stack.services)
  if (loop !== null) {
    problems.push({
      path: ['stack', 'services'],
      message: `needs go round in a loop: ${loop.join(' → ')}`,
    })
  }
  return problems
}

// Each place that needs a worktree's index, when the config doesn't say where one is kept.
function indexProblems(config: ConfigShape): Problem[] {
  if (config.worktrees.index !== undefined) return []
  const problems: Problem[] = []
  const usesIndex = (text: string | undefined, path: Problem['path']) => {
    if (text?.includes(INDEX)) {
      problems.push({
        path,
        message: `uses ${INDEX}, which needs worktrees.index`,
      })
    }
  }
  for (const hook of ['setup', 'install', 'teardown'] as const) {
    usesIndex(config.worktrees[hook], ['worktrees', hook])
  }
  for (const [name, service] of Object.entries(config.stack?.services ?? {})) {
    const at = ['stack', 'services', name]
    usesIndex(service.start, [...at, 'start'])
    usesIndex(service.stop, [...at, 'stop'])
    usesIndex(service.status.command, [...at, 'status', 'command'])
    usesIndex(service.status.compose?.project, [
      ...at,
      'status',
      'compose',
      'project',
    ])
  }
  return problems
}

// zod runs this only once every field has the right shape.
export const ConfigSchema = ConfigObject.superRefine((config, ctx) => {
  const problems = [
    ...(config.stack === undefined ? [] : stackProblems(config.stack)),
    ...indexProblems(config),
  ]
  for (const { path, message } of problems) {
    ctx.addIssue({ code: 'custom', path, message })
  }
}).meta({ title: 'stack-monitor.json' })

export type Config = z.output<typeof ConfigSchema>
export type ConfigInput = z.input<typeof ConfigSchema>
export type StackInput = z.input<typeof Stack>
export type ServiceInput = StackInput['services'][string]

export function modulesOf(config: Config): Modules {
  return {
    worktrees: true,
    stack: config.stack !== undefined,
    agents: config.agents !== undefined,
    featureMap: true,
  }
}
export type StackConfig = z.output<typeof Stack>
export type ServiceConfig = StackConfig['services'][string]
