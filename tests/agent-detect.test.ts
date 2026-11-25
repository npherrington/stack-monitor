import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { claude } from '../core/agents/adapters/claude.ts'
import { opencode } from '../core/agents/adapters/opencode.ts'
import {
  designerDefault,
  findProgram,
  machineDefault,
  readAgent,
  readOllama,
  versionOf,
} from '../core/agents/detect.ts'
import {
  readAgentSettings,
  saveAgentSettings,
} from '../core/agents/settings.ts'
import type { AgentStatus } from '../core/types.ts'
import { fakeClaude, fakeOpencode } from './agent-fakes.ts'
import { tempDir, writeJson } from './fixtures.ts'
import { freePort } from './http-client.ts'

describe('finding the agent CLIs', () => {
  test('finds a program on PATH and reads its version', async () => {
    const bin = join(tempDir(), 'bin')
    mkdirSync(bin)
    const program = join(bin, 'claude')
    writeFileSync(program, '#!/bin/sh\necho "2.1.0 (Claude Code)"\n')
    chmodSync(program, 0o755)
    const env = { PATH: `${bin}:/usr/bin:/bin` }
    const status = await readAgent(claude, {}, env)
    assert.equal(status.installed, true)
    assert.equal(status.path, program)
    assert.equal(status.version, '2.1.0')
    assert.deepEqual(status.models, ['sonnet', 'opus', 'haiku'])
    assert.deepEqual(status.login, {
      state: 'unknown',
      command: 'claude',
      note: claude.login.note,
    })
    assert.equal(status.model, null)
  })

  test('a file on PATH that is not executable is not installed', async () => {
    const bin = join(tempDir(), 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'claude'), 'not a program\n')
    const status = await readAgent(claude, {}, { PATH: bin })
    assert.equal(status.installed, false)
    assert.equal(status.path, null)
    assert.equal(status.version, null)
  })

  test("the settings' program comes first, and a missing one doesn't fall back to PATH", async () => {
    const dir = tempDir()
    const fake = fakeOpencode(dir)
    const status = await readAgent(
      opencode,
      { agents: { opencode: { program: fake, model: 'ollama/tiny:1b' } } },
      { PATH: '' },
    )
    assert.equal(status.path, fake)
    assert.equal(status.version, '0.0.1')
    assert.deepEqual(status.models, [
      'ollama/tiny:1b',
      'opencode/other-free',
      'opencode/deepseek-v4.1-flash-free',
    ])
    assert.equal(status.model, 'ollama/tiny:1b')
    const onPath = join(dir, 'bin')
    mkdirSync(onPath)
    fakeClaude(onPath)
    assert.equal(
      await findProgram(
        claude,
        { agents: { claude: { program: join(dir, 'nowhere') } } },
        { PATH: onPath },
      ),
      null,
    )
  })

  test('versions are read out of what each CLI prints', () => {
    assert.equal(versionOf('2.1.332 (Claude Code)\n'), '2.1.332')
    assert.equal(versionOf('\nopencode v2.3.0\n'), '2.3.0')
    assert.equal(versionOf('dev build'), 'dev build')
    assert.equal(versionOf(''), null)
  })
})

describe('the defaults', () => {
  const agent = (
    id: 'claude' | 'opencode',
    installed: boolean,
    models: string[] = [],
  ) => ({ id, installed, models }) as AgentStatus

  test('the machine default is the settings choice, else the first installed', () => {
    const both = [agent('claude', false), agent('opencode', true)]
    assert.equal(machineDefault({}, both), 'opencode')
    assert.equal(machineDefault({ default: 'claude' }, both), 'claude')
    assert.equal(machineDefault({}, [agent('claude', false)]), null)
  })

  test('the designer is the settings choice, else the free DeepSeek model, else any free one', () => {
    const free = ['opencode/a-free', 'opencode/deepseek-v4.1-flash-free']
    assert.deepEqual(designerDefault({}, [agent('opencode', true, free)]), {
      agent: 'opencode',
      model: 'opencode/deepseek-v4.1-flash-free',
    })
    assert.deepEqual(
      designerDefault({}, [
        agent('opencode', true, ['ollama/x', 'opencode/b-free']),
      ]),
      { agent: 'opencode', model: 'opencode/b-free' },
    )
    assert.equal(
      designerDefault({}, [agent('opencode', true, ['ollama/x'])]),
      null,
    )
    assert.equal(designerDefault({}, [agent('opencode', false, free)]), null)
    const chosen = { agent: 'claude' as const, model: 'haiku' }
    assert.deepEqual(designerDefault({ designer: chosen }, []), chosen)
  })
})

describe('Ollama', () => {
  test('reads the version and models when it answers', async () => {
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(
        req.url === '/api/version'
          ? '{"version":"0.12.0"}'
          : '{"models":[{"name":"qwen3:8b"},{"nope":1}]}',
      )
    })
    await new Promise<void>((listening) =>
      server.listen(0, '127.0.0.1', listening),
    )
    const { port } = server.address() as AddressInfo
    try {
      assert.deepEqual(await readOllama(`http://127.0.0.1:${port}`), {
        running: true,
        version: '0.12.0',
        models: ['qwen3:8b'],
      })
    } finally {
      server.close()
    }
  })

  test('nothing listening reads as not running', async () => {
    const port = await freePort()
    assert.deepEqual(await readOllama(`http://127.0.0.1:${port}`), {
      running: false,
      version: null,
      models: [],
    })
  })
})

describe('the agent settings', () => {
  test('a file without agents reads as none, and saving keeps repos and other keys', async () => {
    const settings = join(tempDir(), '.monitor.json')
    const repos = [{ root: '/src/app', name: 'App' }]
    writeJson(settings, { repos, later: { kept: true } })
    assert.deepEqual(readAgentSettings(settings), {})
    const agents = {
      default: 'opencode' as const,
      designer: { agent: 'opencode' as const, model: 'opencode/x-free' },
      agents: { claude: { program: '/opt/bin/claude', model: 'opus' } },
    }
    const saved = await saveAgentSettings(
      { settings, seed: '/src/seed' },
      agents,
    )
    assert.equal(saved.ok, true)
    assert.deepEqual(readAgentSettings(settings), agents)
    assert.deepEqual(JSON.parse(readFileSync(settings, 'utf8')), {
      repos,
      later: { kept: true },
      agents,
    })
  })

  test('before the file exists, saving seeds the repo list as the first repo save would', async () => {
    const settings = join(tempDir(), 'new', '.monitor.json')
    assert.deepEqual(readAgentSettings(settings), {})
    await saveAgentSettings({ settings, seed: '/src/my-app' }, {})
    assert.deepEqual(JSON.parse(readFileSync(settings, 'utf8')), {
      repos: [{ root: '/src/my-app', name: 'my-app' }],
      agents: {},
    })
  })

  test('agents the file holds that this version cannot read are a problem, not dropped', () => {
    const settings = join(tempDir(), '.monitor.json')
    writeJson(settings, { repos: [], agents: { default: 'codex' } })
    const read = readAgentSettings(settings)
    assert.ok('problem' in read)
    assert.match(read.problem, /agents in the settings file .* aren't valid/)
  })
})
