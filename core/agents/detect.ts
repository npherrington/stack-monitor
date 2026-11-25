// The agent CLIs on this machine, read now: where each is, its version and models, and Ollama.
import { accessSync, constants, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

import { run } from '../run.ts'
import type {
  AgentChoice,
  AgentId,
  AgentSettings,
  AgentStatus,
  AgentsOverview,
  OllamaStatus,
} from '../types.ts'
import type { AgentAdapter } from './adapter.ts'
import { allAdapters } from './adapters/index.ts'

const VERSION_TIMEOUT_MS = 3000
const OLLAMA_TIMEOUT_MS = 1000
export const OLLAMA_URL = 'http://127.0.0.1:11434'

// The free model the designer starts with, when OpenCode offers it.
export const DESIGNER_MODEL = 'opencode/deepseek-v4.1-flash-free'

export function isExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

// The program on the monitor's PATH, as a plain /bin/sh finds it: no login, so no profile runs.
export async function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const found = await run('/bin/sh', ['-c', 'command -v "$1"', 'sh', name], {
    env,
    timeoutMs: VERSION_TIMEOUT_MS,
  })
  const path = found.stdout.trim()
  // A builtin or an alias of the same name comes back as the bare name.
  return found.code === 0 && isAbsolute(path) && isExecutable(path)
    ? path
    : null
}

// The settings' override when there is one (and only it: a typo there mustn't fall back to PATH).
export function findProgram(
  adapter: AgentAdapter,
  settings: AgentSettings,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const override = settings.agents?.[adapter.id]?.program
  if (override !== undefined) {
    return Promise.resolve(isExecutable(override) ? override : null)
  }
  return findOnPath(adapter.program, env)
}

// "2.1.332 (Claude Code)", "opencode v2.3.0": the version number, else the first line.
export function versionOf(output: string): string | null {
  const line = output
    .split('\n')
    .map((each) => each.trim())
    .find(Boolean)
  if (line === undefined) return null
  return /\d+\.\d+[\w.+-]*/.exec(line)?.[0] ?? line.slice(0, 80)
}

async function readVersion(program: string): Promise<string | null> {
  const read = await run(program, ['--version'], {
    timeoutMs: VERSION_TIMEOUT_MS,
  })
  return read.code === 0 ? versionOf(read.stdout || read.stderr) : null
}

export async function readAgent(
  adapter: AgentAdapter,
  settings: AgentSettings,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AgentStatus> {
  const path = await findProgram(adapter, settings, env)
  const [version, models] =
    path === null
      ? [null, []]
      : await Promise.all([readVersion(path), adapter.models(path)])
  return {
    id: adapter.id,
    label: adapter.label,
    installed: path !== null,
    path,
    version,
    login: { state: 'unknown', ...adapter.login },
    install: adapter.install,
    models,
    model: settings.agents?.[adapter.id]?.model ?? null,
    can: adapter.can,
  }
}

// What Run here starts with: the settings' choice, else the first installed.
export function machineDefault(
  settings: AgentSettings,
  agents: AgentStatus[],
): AgentId | null {
  return settings.default ?? agents.find((agent) => agent.installed)?.id ?? null
}

// What drafts skills and prompts: the settings' choice, else a free OpenCode model.
export function designerDefault(
  settings: AgentSettings,
  agents: AgentStatus[],
): AgentChoice | null {
  if (settings.designer !== undefined) return settings.designer
  const opencode = agents.find((agent) => agent.id === 'opencode')
  if (opencode === undefined || !opencode.installed) return null
  const model = opencode.models.includes(DESIGNER_MODEL)
    ? DESIGNER_MODEL
    : opencode.models.find((each) => /^opencode\/.*-free$/.test(each))
  return model === undefined ? null : { agent: 'opencode', model }
}

async function getJson(url: string): Promise<unknown> {
  const answer = await fetch(url, {
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  })
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}`)
  return answer.json()
}

// Anything short of both answers reads as not running.
export async function readOllama(base = OLLAMA_URL): Promise<OllamaStatus> {
  try {
    const [version, tags] = (await Promise.all([
      getJson(`${base}/api/version`),
      getJson(`${base}/api/tags`),
    ])) as [{ version?: unknown }, { models?: unknown }]
    const models = Array.isArray(tags.models)
      ? tags.models.flatMap((model: { name?: unknown }) =>
          typeof model?.name === 'string' ? [model.name] : [],
        )
      : []
    return {
      running: true,
      version: typeof version.version === 'string' ? version.version : null,
      models,
    }
  } catch {
    return { running: false, version: null, models: [] }
  }
}

export function readAgents(
  settings: AgentSettings,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AgentStatus[]> {
  return Promise.all(
    allAdapters().map((adapter) => readAgent(adapter, settings, env)),
  )
}

export async function readOverview(
  settings: AgentSettings,
  { env = process.env, ollama = OLLAMA_URL } = {},
): Promise<AgentsOverview> {
  const [agents, ollamaStatus] = await Promise.all([
    readAgents(settings, env),
    readOllama(ollama),
  ])
  return {
    agents,
    default: machineDefault(settings, agents),
    designer: designerDefault(settings, agents),
    ollama: ollamaStatus,
  }
}
