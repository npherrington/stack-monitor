// A schedule that fires from launchd is a LaunchAgent: a plist in ~/Library/LaunchAgents whose
// StartCalendarInterval is its cron line, running the host's fire command with the schedule's id.
// launchd fires it whether the monitor is running or not. macOS keeps LaunchAgents out of
// ~/Desktop, ~/Documents and ~/Downloads unless the program has Full Disk Access, so a probe job
// checks first that launchd can read what a fire needs.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { isAbsolute, join } from 'node:path'

import { run } from '../run.ts'

export const LABEL_PREFIX = 'dev.stack-monitor.schedule.'
const PROBE_LABEL = 'dev.stack-monitor.probe'
const PROBE_WAIT_MS = 8000

// What a LaunchAgent runs to fire a schedule, the id appended. In development it's node and
// core/schedules/fire-cli.ts; a packaged app passes its own helper.
export interface FireCommand {
  program: string
  args: string[]
  env: Record<string, string> // PATH and the monitor's own variables, which launchd doesn't pass
}

export interface Launchd {
  install(
    id: string,
    intervals: Record<string, number>[],
  ): Promise<string | null> // why not
  remove(id: string): Promise<void>
  loaded(id: string): Promise<boolean>
  // The first path launchd's jobs can't read, or null when they can read them all.
  probe(paths: string[]): Promise<string | null>
  program: string // what Full Disk Access is given to
  reads: string[] // the files a fire reads before it reaches the checkout
  errLog(id: string): string
}

function xml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function plistValue(value: unknown, indent: string): string {
  if (typeof value === 'string')
    return `${indent}<string>${xml(value)}</string>`
  if (typeof value === 'number') return `${indent}<integer>${value}</integer>`
  if (typeof value === 'boolean') return `${indent}<${value}/>`
  if (Array.isArray(value)) {
    return [
      `${indent}<array>`,
      ...value.map((each) => plistValue(each, `${indent}  `)),
      `${indent}</array>`,
    ].join('\n')
  }
  const entries = Object.entries(value as Record<string, unknown>)
  return [
    `${indent}<dict>`,
    ...entries.flatMap(([key, each]) => [
      `${indent}  <key>${xml(key)}</key>`,
      plistValue(each, `${indent}  `),
    ]),
    `${indent}</dict>`,
  ].join('\n')
}

export function plist(dict: Record<string, unknown>): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    plistValue(dict, ''),
    '</plist>',
    '',
  ].join('\n')
}

export function scheduleJob(
  id: string,
  intervals: Record<string, number>[],
  fire: FireCommand,
  logs: string,
): Record<string, unknown> {
  return {
    Label: `${LABEL_PREFIX}${id}`,
    ProgramArguments: [fire.program, ...fire.args, id],
    EnvironmentVariables: fire.env,
    StartCalendarInterval: intervals,
    WorkingDirectory: logs,
    StandardOutPath: join(logs, `${id}.out`),
    StandardErrorPath: join(logs, `${id}.err`),
    // The run it starts outlives the fire; launchd would otherwise end it with the job.
    AbandonProcessGroup: true,
  }
}

// Reads each path given and prints what happened, so the probe needs nothing but node.
const PROBE_SCRIPT = `
const fs = require('node:fs')
for (const path of process.argv.slice(1)) {
  try {
    fs.statSync(path).isDirectory() ? fs.readdirSync(path) : fs.readFileSync(path)
    console.log('ok ' + path)
  } catch (error) {
    console.log('blocked ' + path)
  }
}
console.log('done')
`

export interface SystemLaunchdOptions {
  fire: FireCommand
  logs: string // where jobs write their output
  agentsDir?: string // ~/Library/LaunchAgents
  launchctl?: string
  node?: string // runs the probe
}

export function systemLaunchd({
  fire,
  logs,
  agentsDir = join(homedir(), 'Library', 'LaunchAgents'),
  launchctl = '/bin/launchctl',
  node = process.execPath,
}: SystemLaunchdOptions): Launchd {
  const domain = `gui/${userInfo().uid}`
  const plistPath = (label: string) => join(agentsDir, `${label}.plist`)
  const bootout = (label: string) =>
    run(launchctl, ['bootout', `${domain}/${label}`])

  const load = async (label: string, dict: Record<string, unknown>) => {
    mkdirSync(agentsDir, { recursive: true })
    mkdirSync(logs, { recursive: true })
    await bootout(label)
    writeFileSync(plistPath(label), plist(dict))
    return run(launchctl, ['bootstrap', domain, plistPath(label)])
  }

  return {
    program: fire.program,
    reads: fire.args.filter((arg) => isAbsolute(arg)),
    errLog: (id) => join(logs, `${id}.err`),
    async install(id, intervals) {
      const label = `${LABEL_PREFIX}${id}`
      rmSync(join(logs, `${id}.err`), { force: true })
      const loaded = await load(label, scheduleJob(id, intervals, fire, logs))
      return loaded.code === 0
        ? null
        : `launchctl bootstrap failed: ${loaded.stderr.trim() || `exit ${loaded.code}`}`
    },
    async remove(id) {
      const label = `${LABEL_PREFIX}${id}`
      await bootout(label)
      rmSync(plistPath(label), { force: true })
    },
    async loaded(id) {
      const printed = await run(launchctl, [
        'print',
        `${domain}/${LABEL_PREFIX}${id}`,
      ])
      return printed.code === 0
    },
    async probe(paths) {
      const out = join(logs, 'probe.out')
      rmSync(out, { force: true })
      const loaded = await load(PROBE_LABEL, {
        Label: PROBE_LABEL,
        ProgramArguments: [node, '-e', PROBE_SCRIPT, ...paths],
        RunAtLoad: true,
        WorkingDirectory: logs,
        StandardOutPath: out,
        StandardErrorPath: out,
      })
      try {
        if (loaded.code !== 0) return null // can't tell; the fire's own log will say
        const deadline = Date.now() + PROBE_WAIT_MS
        while (Date.now() < deadline) {
          const text = existsSync(out) ? readFileSync(out, 'utf8') : ''
          if (text.includes('done')) {
            const blocked = /^blocked (.+)$/m.exec(text)
            return blocked === null ? null : blocked[1]
          }
          await new Promise((wait) => setTimeout(wait, 200))
        }
        return null
      } finally {
        await bootout(PROBE_LABEL)
        rmSync(plistPath(PROBE_LABEL), { force: true })
      }
    },
  }
}
