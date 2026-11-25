import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { before, describe, test } from 'node:test'

import {
  listClaudeWorkflows,
  runClaudeWorkflow,
} from '../core/agents/claude-workflows.ts'
import { readMetaLiteral } from '../core/agents/meta-literal.ts'
import { readRun } from '../core/agents/runs.ts'
import { writeJsonFile, type Tracking } from '../core/settings.ts'
import type { RunDetail } from '../core/types.ts'
import { fakeClaude } from './agent-fakes.ts'
import { git, gitRepo, tempDir, writeJson } from './fixtures.ts'

delete process.env.STACK_MONITOR_CONFIG

const META = `// The header
export const meta = {
  name: 'bug-hunt',
  description: "Drive the app, ticket what's broken",
  whenToUse: \`From the monitor\`,
  phases: [
    { title: 'Explore' },
    { title: 'Fix', detail: 'the worst one' }, // trailing comma next
  ],
  count: 3, ok: true, none: null,
}

const opts = args || {}
`

describe("reading a Workflow script's meta", () => {
  test('reads a pure literal: quotes of each kind, comments, trailing commas', () => {
    assert.deepEqual(readMetaLiteral(META), {
      name: 'bug-hunt',
      description: "Drive the app, ticket what's broken",
      whenToUse: 'From the monitor',
      phases: [{ title: 'Explore' }, { title: 'Fix', detail: 'the worst one' }],
      count: 3,
      ok: true,
      none: null,
    })
  })

  test('says why anything else is not one, and runs none of it', () => {
    assert.match(
      String(readMetaLiteral('const x = 1').problem),
      /no export const meta/,
    )
    for (const bad of [
      'export const meta = { name: `a${b}` }',
      'export const meta = { name: run() }',
      'export const meta = { name: x }',
      "export const meta = { name: 'open",
    ]) {
      assert.match(String(readMetaLiteral(bad).problem), /pure literal/, bad)
    }
  })
})

function write(path: string, text: string, executable = false) {
  writeFileSync(path, text)
  if (executable) chmodSync(path, 0o755)
}

const manifest = (more: Record<string, unknown> = {}) =>
  JSON.stringify({
    label: 'Bug hunt',
    description: 'Hunts bugs',
    argument: 'none',
    argumentLabel: null,
    testRun: true,
    sessions: 'one',
    cost: 'An hour',
    effort: 'high',
    ...more,
  })

describe('listing .claude/workflows', () => {
  test('a script, a script with a launcher, a launcher alone, and what is wrong with the rest', () => {
    const root = tempDir()
    const dir = join(root, '.claude', 'workflows')
    mkdirSync(dir, { recursive: true })
    write(join(dir, 'bug-hunt.js'), META)
    write(join(dir, 'bug-hunt.json'), manifest())
    write(join(dir, 'bug-hunt.sh'), '#!/bin/sh\n', true)
    write(
      join(dir, 'plain.js'),
      "export const meta = { name: 'plain', description: 'Just a script' }\n",
    )
    write(
      join(dir, 'queue.json'),
      manifest({
        label: 'Queue',
        argument: 'tickets',
        argumentLabel: 'Tickets',
        testRun: false,
        sessions: 'many',
      }),
    )
    write(join(dir, 'queue.sh'), '#!/bin/sh\n', true)
    write(join(dir, 'state.json'), '{"not":"a manifest"}')
    write(join(dir, 'renamed.js'), "export const meta = { name: 'other' }\n")
    write(join(dir, 'stiff.json'), manifest())
    write(join(dir, 'stiff.sh'), '#!/bin/sh\n')
    write(join(dir, 'README.md'), '# notes\n')

    const { claude, problems } = listClaudeWorkflows(root)
    assert.deepEqual(
      claude.map((each) => [each.name, each.launcher, each.label]),
      [
        ['bug-hunt', true, 'Bug hunt'],
        ['plain', false, 'plain'],
        ['queue', true, 'Queue'],
      ],
    )
    assert.deepEqual(claude[0].phases, ['Explore', 'Fix'])
    assert.equal(claude[0].testRun, true)
    assert.equal(claude[1].description, 'Just a script')
    assert.equal(claude[2].argument, 'tickets')
    assert.deepEqual(problems, [
      {
        file: '.claude/workflows/renamed.js',
        problem: 'its meta.name is "other", not renamed',
      },
      { file: '.claude/workflows/stiff.sh', problem: "isn't executable" },
    ])
  })

  test('a repo without the folder has none', () => {
    assert.deepEqual(listClaudeWorkflows(tempDir()), {
      claude: [],
      problems: [],
    })
  })
})

async function waitFor(id: string, dir: string): Promise<RunDetail> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const detail = await readRun(id, dir)
    if (detail !== null && detail.run.state !== 'running') return detail
    if (Date.now() > deadline) assert.fail(`run ${id} didn't end`)
    await new Promise((wait) => setTimeout(wait, 50))
  }
}

describe('running a Claude Code workflow', () => {
  let tracking: Tracking
  let primary: string
  let runs: string

  before(() => {
    const root = tempDir()
    primary = gitRepo(join(root, 'app'))
    const dir = join(primary, '.claude', 'workflows')
    mkdirSync(dir, { recursive: true })
    write(join(dir, 'bug-hunt.js'), META)
    write(join(dir, 'bug-hunt.json'), manifest())
    // Says what it was given, then runs claude with what follows --, as Latitude's do.
    write(
      join(dir, 'bug-hunt.sh'),
      '#!/bin/sh\necho "launcher got: $*"\nwhile [ "$1" != "--" ]; do shift; done\nshift\nexec claude "$@" "run it"\n',
      true,
    )
    write(join(dir, 'plain.js'), "export const meta = { name: 'plain' }\n")
    git(primary, 'add', '.claude')
    git(primary, 'commit', '-q', '-m', 'workflows')
    // The launcher calls claude by name: the fake, under that name.
    const bin = join(root, 'bin')
    mkdirSync(bin)
    symlinkSync(fakeClaude(root), join(bin, 'claude'))
    const settings = join(root, 'config', '.monitor.json')
    writeJsonFile(settings, {
      repos: [{ root: primary, name: 'app' }],
      agents: { agents: { claude: { program: join(bin, 'claude') } } },
    })
    writeJson(join(primary, 'stack-monitor.json'), {})
    tracking = { settings, seed: primary }
    runs = join(root, 'runs')
  })

  test("runs the launcher with its options, then claude's flags after --", async () => {
    const started = await runClaudeWorkflow(
      tracking,
      {
        checkout: primary,
        name: 'bug-hunt',
        testRun: true,
        notes: 'only login',
      },
      { dir: runs },
    )
    assert.equal(started.ok, true, started.message)
    const { run, events } = await waitFor(started.runId ?? '', runs)
    assert.equal(run.state, 'done')
    assert.equal(run.title, 'Bug hunt (test run)')
    assert.equal(run.report, 'first done')
    const said = events.flatMap((event) =>
      event.kind === 'text' ? [event.text] : [],
    )
    assert.match(
      said[0],
      /^launcher got: --no-publish --effort=high --notes=only login -- -p --session-id [0-9a-f-]{36} -n Bug hunt --output-format stream-json --verbose$/,
    )
  })

  test('runs a bare script by asking claude to start it with the Workflow tool', async () => {
    const started = await runClaudeWorkflow(
      tracking,
      {
        checkout: primary,
        name: 'plain',
        notes: 'go easy',
        permissions: 'read',
      },
      { dir: runs },
    )
    assert.equal(started.ok, true, started.message)
    const { run } = await waitFor(started.runId ?? '', runs)
    assert.equal(run.state, 'done')
    assert.equal(run.permissions, 'read')
  })

  test('refuses a launcher changed since its commit, and an unknown name', async () => {
    write(
      join(primary, '.claude', 'workflows', 'bug-hunt.sh'),
      '#!/bin/sh\necho changed\n',
      true,
    )
    const changed = await runClaudeWorkflow(
      tracking,
      { checkout: primary, name: 'bug-hunt' },
      { dir: runs },
    )
    assert.match(changed.message, /isn't committed unchanged/)
    git(primary, 'checkout', '--', '.claude/workflows/bug-hunt.sh')
    const missing = await runClaudeWorkflow(
      tracking,
      { checkout: primary, name: 'nope' },
      { dir: runs },
    )
    assert.match(missing.message, /has no Claude Code workflow nope/)
  })
})
