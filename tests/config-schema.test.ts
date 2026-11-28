import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  ConfigSchema,
  modulesOf,
  type ConfigInput,
} from '../core/config/schema.ts'

const EXAMPLE = join(
  import.meta.dirname,
  '..',
  'examples',
  'node-postgres.json',
)

// "path: message" for each issue, or [] when it parses.
function problems(input: unknown): string[] {
  const parsed = ConfigSchema.safeParse(input)
  return parsed.success
    ? []
    : parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      )
}

function withServices(
  services: Record<string, unknown>,
  extra: Partial<ConfigInput> = {},
): Record<string, unknown> {
  return { ...extra, stack: { services } }
}

const API = {
  start: 'npm run api',
  status: { port: { file: '.env', key: 'API_PORT' } },
}

describe('the config schema', () => {
  test('takes the example in examples/', () => {
    const config = ConfigSchema.parse(JSON.parse(readFileSync(EXAMPLE, 'utf8')))
    assert.deepEqual(modulesOf(config), {
      worktrees: true,
      stack: true,
      agents: true,
      featureMap: true,
    })
    assert.equal(config.stack?.services.worker.status.process?.owner, 'cwd')
  })

  test('an empty file is the defaults: worktrees and the feature map only', () => {
    const config = ConfigSchema.parse({})
    assert.equal(config.mainline, 'origin/main')
    assert.deepEqual(config.worktrees, {})
    assert.deepEqual(modulesOf(config), {
      worktrees: true,
      stack: false,
      agents: false,
      featureMap: true,
    })
  })

  test('fills in a service and the agents section', () => {
    const config = ConfigSchema.parse({
      ...withServices({ api: API }),
      agents: {},
    })
    assert.deepEqual(config.stack?.services.api.needs, [])
    assert.equal(config.stack?.services.api.oneShot, false)
    assert.deepEqual(config.stack?.shared, [])
    assert.deepEqual(config.agents, {
      default: 'claude',
      env: {},
      arguments: {},
    })
  })

  test('refuses a key it does not know, at any depth', () => {
    assert.deepEqual(problems({ mainlne: 'main' }), [
      ': Unrecognized key: "mainlne"',
    ])
    assert.equal(
      problems(withServices({ api: { ...API, restart: 'x' } })).length,
      1,
    )
  })

  test('refuses a mainline git would read as an option', () => {
    assert.deepEqual(problems({ mainline: '--upload-pack=evil' }), [
      'mainline: must be a git ref such as origin/main',
    ])
  })

  test('keeps paths inside the checkout', () => {
    assert.deepEqual(problems({ featureMap: { blocks: '/etc/blocks.json' } }), [
      'featureMap.blocks: must be a path inside the checkout, without ..',
    ])
    assert.deepEqual(problems({ featureMap: { maps: '../maps' } }), [
      'featureMap.maps: must be a path inside the checkout, without ..',
    ])
    assert.deepEqual(problems({ agents: { workflows: 'a/../../b' } }), [
      'agents.workflows: must be a path inside the checkout, without ..',
    ])
  })

  test('takes exactly one way to read a status', () => {
    const none = withServices({ api: { start: 'x', status: {} } })
    const two = withServices({
      api: { start: 'x', status: { command: 'true', process: { match: 'x' } } },
    })
    const message =
      'stack.services.api.status: needs exactly one of port, compose, process or command'
    assert.deepEqual(problems(none), [message])
    assert.deepEqual(problems(two), [message])
  })

  test('a port takes file and key together, or a base', () => {
    const keyless = withServices({
      api: { start: 'x', status: { port: { file: '.env' } } },
    })
    assert.deepEqual(problems(keyless), [
      'stack.services.api.status.port: file and key go together',
    ])
    const empty = withServices({ api: { start: 'x', status: { port: {} } } })
    assert.deepEqual(problems(empty), [
      'stack.services.api.status.port: needs file and key, or base',
    ])
  })

  test('refuses a ready pattern that is not a regular expression', () => {
    assert.deepEqual(problems(withServices({ api: { ...API, ready: '(' } })), [
      "stack.services.api.ready: isn't a valid regular expression",
    ])
  })

  test('refuses ready on a oneShot service', () => {
    assert.deepEqual(
      problems(withServices({ api: { ...API, oneShot: true, ready: 'up' } })),
      [
        "stack.services.api.ready: a oneShot service's exit says it's up, so it takes no ready",
      ],
    )
  })

  test('needs and startAll name declared services', () => {
    const config = {
      stack: {
        services: { api: { ...API, needs: ['db', 'api', 'constructor'] } },
        startAll: ['api', 'web'],
      },
    }
    assert.deepEqual(problems(config), [
      "stack.services.api.needs.0: db isn't one of the services",
      "stack.services.api.needs.1: api can't need itself",
      "stack.services.api.needs.2: constructor isn't one of the services",
      "stack.startAll.1: web isn't one of the services",
    ])
  })

  test('refuses needs that go round in a loop', () => {
    const config = withServices({
      a: { ...API, needs: ['b'] },
      b: { ...API, needs: ['c'] },
      c: { ...API, needs: ['a'] },
    })
    assert.deepEqual(problems(config), [
      'stack.services: needs go round in a loop: a → b → c → a',
    ])
  })

  test('{index} needs worktrees.index; a port base alone is a fixed port', () => {
    const config = {
      worktrees: { teardown: 'docker compose -p app_wt{index} down' },
      stack: {
        services: { api: { start: 'x', status: { port: { base: 3000 } } } },
      },
    }
    assert.deepEqual(problems(config), [
      'worktrees.teardown: uses {index}, which needs worktrees.index',
    ])
    const indexed = {
      ...config,
      worktrees: {
        ...config.worktrees,
        index: { file: '.env.worktree', key: 'N' },
      },
    }
    assert.deepEqual(problems(indexed), [])
  })

  test('a shared service is reached over http', () => {
    const config = {
      stack: {
        services: { api: API },
        shared: [{ name: 'x', url: 'file:///etc/passwd' }],
      },
    }
    assert.deepEqual(problems(config), ['stack.shared.0.url: Invalid URL'])
  })
})
