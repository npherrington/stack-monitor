import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import type { RunResult } from '../core/run.ts'
import {
  composeServiceNames,
  detectServices,
  portFlag,
  settle,
  slug,
  type Runner,
} from '../core/stack/detect.ts'
import { gitRepo, tempDir, writeJson } from './fixtures.ts'

const ENOENT: RunResult = { code: -1, stdout: '', stderr: 'spawn x ENOENT' }

// Neither mise nor docker installed, so detection reads the files alone. Records what it was asked
// to run.
function missingPrograms(asked: string[][] = []): Runner {
  return async (program, args) => {
    asked.push([program, ...args])
    return ENOENT
  }
}

function repo(files: Record<string, unknown>): string {
  const root = gitRepo(join(tempDir(), 'shop'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    if (typeof content === 'string') writeFileSync(join(root, path), content)
    else writeJson(join(root, path), content)
  }
  return root
}

describe('detecting services from package.json', () => {
  test('a vite dev script: npm run dev, on vite’s default port, said to be guessed', async () => {
    const root = repo({
      'package.json': { scripts: { dev: 'vite', build: 'vite build' } },
    })
    assert.deepEqual(await detectServices(root, missingPrograms()), [
      {
        name: 'dev',
        from: 'package.json',
        service: { start: 'npm run dev', status: { port: { base: 5173 } } },
        note: "port guessed from vite's default",
      },
    ])
  })

  test('next with a pnpm lockfile runs through pnpm, on 3000', async () => {
    const root = repo({
      'package.json': { scripts: { start: 'next start', lint: 'next lint' } },
      'pnpm-lock.yaml': '',
    })
    const [found] = await detectServices(root, missingPrograms())
    assert.deepEqual(found.service, {
      start: 'pnpm run start',
      status: { port: { base: 3000 } },
    })
    assert.equal(found.note, "port guessed from next's default")
  })

  test('a port flag or PORT= in the script is taken as written', async () => {
    assert.equal(portFlag('vite --port 4000'), 4000)
    assert.equal(portFlag('astro dev --port=4400'), 4400)
    assert.equal(portFlag('next dev -p 3100'), 3100)
    assert.equal(portFlag('PORT=8080 node server.js'), 8080)
    assert.equal(portFlag('API_PORT=8080 node server.js'), null)
    const root = repo({
      'package.json': { scripts: { serve: 'PORT=8080 node server.js' } },
    })
    const [found] = await detectServices(root, missingPrograms())
    assert.deepEqual(found.service.status, { port: { base: 8080 } })
    assert.equal(found.note, null)
  })

  test('workspace packages, one level deep, each run through the root', async () => {
    const root = repo({
      'package.json': {
        workspaces: ['packages/*', 'tools/cli'],
        scripts: { 'docs:dev': 'storybook dev' },
      },
      'packages/web/package.json': {
        name: '@shop/web',
        scripts: { dev: 'vite --port 4000', 'api:dev': 'tsx watch api.ts' },
      },
      'packages/empty/README': 'no package.json here',
      'tools/cli/package.json': { scripts: { start: 'node cli.js --watch' } },
    })
    const found = await detectServices(root, missingPrograms())
    assert.deepEqual(
      found.map(({ name, from, service }) => [name, from, service]),
      [
        [
          'docs',
          'package.json',
          { start: 'npm run docs:dev', status: { port: { base: 6006 } } },
        ],
        [
          'web',
          'packages/web/package.json',
          {
            start: 'npm run dev -w @shop/web',
            status: { port: { base: 4000 } },
          },
        ],
        [
          'web-api',
          'packages/web/package.json',
          {
            start: 'npm run api:dev -w @shop/web',
            status: { process: { match: 'tsx watch api.ts' } },
          },
        ],
        [
          'cli',
          'tools/cli/package.json',
          {
            start: 'npm run start --prefix tools/cli',
            status: { process: { match: 'node cli.js --watch' } },
          },
        ],
      ],
    )
    assert.match(found[2].note ?? '', /command line/)
  })
})

describe('detecting services from a Procfile and a compose file', () => {
  test('each Procfile line is a process service', async () => {
    const root = repo({
      Procfile: 'web: bundle exec rails s\nworker: bundle exec sidekiq\n\n',
    })
    const found = await detectServices(root, missingPrograms())
    assert.deepEqual(
      found.map(({ name, from, service }) => [name, from, service]),
      [
        [
          'web',
          'Procfile',
          {
            start: 'bundle exec rails s',
            status: { process: { match: 'bundle exec rails s' } },
          },
        ],
        [
          'worker',
          'Procfile',
          {
            start: 'bundle exec sidekiq',
            status: { process: { match: 'bundle exec sidekiq' } },
          },
        ],
      ],
    )
  })

  test('without docker, the compose services come from the file’s top-level keys', async () => {
    const yaml = [
      'name: shop',
      'services:',
      '  # the database',
      '  postgres:',
      '    image: postgres:16',
      '    environment:',
      '      POSTGRES_PASSWORD: x',
      '  "redis":',
      '    image: redis:7',
      'volumes:',
      '  data:',
      '',
    ].join('\n')
    assert.deepEqual(composeServiceNames(yaml), ['postgres', 'redis'])
    const root = repo({ 'compose.yaml': yaml })
    const asked: string[][] = []
    assert.deepEqual(await detectServices(root, missingPrograms(asked)), [
      {
        name: 'shop',
        from: 'compose.yaml',
        service: {
          start: 'docker compose up -d --wait',
          oneShot: true,
          status: { compose: { parts: ['postgres', 'redis'] } },
        },
        note: null,
      },
    ])
    assert.deepEqual(asked, [
      ['mise', 'tasks', '--json'],
      ['docker', 'compose', 'config', '--services'],
    ])
  })

  test('with docker, its own list of the services is used', async () => {
    const root = repo({ 'docker-compose.yml': 'services:\n  ignored:\n' })
    const docker: Runner = async (program) =>
      program === 'docker'
        ? { code: 0, stdout: 'db\ncache\n', stderr: '' }
        : ENOENT
    const [found] = await detectServices(root, docker)
    assert.deepEqual(found.service.status, {
      compose: { parts: ['db', 'cache'] },
    })
  })
})

describe('detecting mise tasks', () => {
  test('dev, start, serve and up tasks, as process services', async () => {
    const root = repo({})
    const mise: Runner = async (program) =>
      program === 'mise'
        ? {
            code: 0,
            stdout: JSON.stringify([
              { name: 'build' },
              { name: 'dev:api' },
              { name: 'up' },
            ]),
            stderr: '',
          }
        : ENOENT
    const found = await detectServices(root, mise)
    assert.deepEqual(
      found.map(({ name, service }) => [name, service]),
      [
        [
          'dev-api',
          {
            start: 'mise run dev:api',
            status: { process: { match: 'mise run dev:api' } },
          },
        ],
        [
          'up',
          {
            start: 'mise run up',
            status: { process: { match: 'mise run up' } },
          },
        ],
      ],
    )
  })

  test('an untrusted config is skipped without an error', async () => {
    const root = repo({})
    const untrusted: Runner = async () => ({
      code: 1,
      stdout: '',
      stderr: 'mise ERROR Config files in ~/x/mise.toml are not trusted.',
    })
    assert.deepEqual(await detectServices(root, untrusted), [])
  })
})

describe('naming the suggestions', () => {
  test('names fit the schema: lowercase, a letter first, 24 at most', () => {
    assert.equal(slug('Web_Server'), 'web-server')
    assert.equal(slug('2fa:dev'), 'fa-dev')
    assert.equal(slug('a'.repeat(30)), 'a'.repeat(24))
    assert.equal(slug('---'), 'service')
  })

  test('a repeated name gets a number; a suggestion the schema refuses is dropped', () => {
    const service = { start: 'x', status: { process: { match: 'x' } } }
    const settled = settle([
      { name: 'web', from: 'a', service, note: null },
      { name: 'Web', from: 'b', service, note: null },
      {
        name: 'broken',
        from: 'c',
        service: { start: '', status: {} },
        note: null,
      },
    ])
    assert.deepEqual(
      settled.map(({ name, from }) => [name, from]),
      [
        ['web', 'a'],
        ['web-2', 'b'],
      ],
    )
  })
})
