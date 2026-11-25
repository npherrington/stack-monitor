import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { ConfigSchema } from '../core/config/schema.ts'
import {
  parseContainers,
  parseCwds,
  parseLabels,
  parseListeners,
  parsePs,
  type Machine,
} from '../core/stack/machine.ts'
import {
  argumentOwner,
  commandState,
  composeState,
  machineNeeds,
  owningCheckout,
  parseEnv,
  portState,
  processState,
  readIndex,
  UNTRUSTED_COMMAND,
  type Place,
} from '../core/stack/status.ts'
import { tempDir } from './fixtures.ts'

const PRIMARY = '/src/app'
const LINKED = '/src/app-wt1'
const NESTED = '/src/app/.worktrees/wt2'
const ROOTS = [PRIMARY, LINKED, NESTED]

// `lsof -nP -iTCP -sTCP:LISTEN -FpcnT`, as macOS prints it.
const LISTEN = [
  'p101',
  'cnode',
  'f20',
  'n127.0.0.1:5173',
  'TST=LISTEN',
  'TQR=0',
  'f21',
  'n[::1]:5173',
  'TST=LISTEN',
  'p202',
  'cnode',
  'f18',
  'n*:3001',
  'TST=LISTEN',
  'p303',
  'cpostgres',
  'f7',
  'n*:5432',
  'TST=LISTEN',
  '',
].join('\n')

// `lsof -a -d cwd -p ... -Fpn`.
const CWDS = [
  'p101',
  'fcwd',
  `n${LINKED}`,
  'p202',
  'fcwd',
  `n${NESTED}/web`,
  'p303',
  'fcwd',
  'n/opt/homebrew/var',
  'p404',
  'fcwd',
  `n${PRIMARY}`,
  '',
].join('\n')

const PS = [
  '  101 node /src/app-wt1/node_modules/.bin/vite',
  '  404 node dist/worker.js',
  '  505 /usr/bin/python3 /src/My Projects/app/run.py --watch',
  '  606 node dist/worker.js',
  '',
].join('\n')

function container(
  service: string,
  workingDir: string,
  state: string,
  project = 'app',
) {
  return JSON.stringify({
    Names: `${project}-${service}-1`,
    State: state,
    Labels: [
      'com.docker.compose.config-hash=abc',
      `com.docker.compose.project=${project}`,
      `com.docker.compose.project.working_dir=${workingDir}`,
      `com.docker.compose.service=${service}`,
    ].join(','),
  })
}

const DOCKER = [
  container('postgres', `${LINKED}/backend`, 'running', 'app_wt1'),
  container('redis', LINKED, 'exited', 'app_wt1'),
  container('postgres', PRIMARY, 'running', 'app'),
  container('redis', PRIMARY, 'running', 'app'),
  JSON.stringify({ Names: 'loose', State: 'running', Labels: '' }),
  '',
].join('\n')

function machine(): Machine {
  return {
    listeners: parseListeners(LISTEN),
    processes: parsePs(PS),
    cwds: parseCwds(CWDS),
    containers: { ok: true, list: parseContainers(DOCKER) },
    unreadable: null,
  }
}

function place(path: string, extra: Partial<Place> = {}): Place {
  return {
    path,
    roots: ROOTS,
    index: null,
    readEnv: () => null,
    ...extra,
  }
}

const env = (text: string) => () => parseEnv(text)

describe('reading the machine', () => {
  test('lsof listeners: port to pids, each address once per pid', () => {
    assert.deepEqual(
      [...parseListeners(LISTEN)],
      [
        [5173, [101]],
        [3001, [202]],
        [5432, [303]],
      ],
    )
  })

  test('lsof cwds and ps lines', () => {
    assert.equal(parseCwds(CWDS).get(202), `${NESTED}/web`)
    assert.deepEqual(parsePs(PS)[2], {
      pid: 505,
      command: '/usr/bin/python3 /src/My Projects/app/run.py --watch',
    })
  })

  test("docker's labels, a comma in a value kept, and only compose containers", () => {
    assert.deepEqual(
      [...parseLabels('a=1,com.docker.compose.project.working_dir=/x,y,b=2')],
      [
        ['a', '1'],
        ['com.docker.compose.project.working_dir', '/x,y'],
        ['b', '2'],
      ],
    )
    const list = parseContainers(DOCKER)
    assert.equal(list.length, 4)
    assert.deepEqual(list[1], {
      name: 'app_wt1-redis-1',
      running: false,
      project: 'app_wt1',
      service: 'redis',
      workingDir: LINKED,
    })
  })

  test('what a stack needs read', () => {
    const { stack } = ConfigSchema.parse({
      stack: {
        services: {
          web: { start: 'x', status: { port: { file: '.env', key: 'PORT' } } },
          worker: { start: 'x', status: { process: { match: 'worker.js' } } },
        },
      },
    })
    assert.ok(stack)
    assert.deepEqual(machineNeeds([stack]), {
      ports: true,
      matches: ['worker.js'],
      compose: false,
    })
  })
})

describe('which checkout a path belongs to', () => {
  test('the deepest checkout holding it wins', () => {
    assert.equal(owningCheckout(`${NESTED}/web`, ROOTS), NESTED)
    assert.equal(owningCheckout(`${PRIMARY}/src`, ROOTS), PRIMARY)
    assert.equal(owningCheckout(LINKED, ROOTS), LINKED)
    // A sibling whose name starts the same isn't inside.
    assert.equal(owningCheckout('/src/app-other', ROOTS), null)
  })
})

describe('env files', () => {
  test('reads KEY=value, export, quotes and comments; the last of a key wins', () => {
    const values = parseEnv(
      [
        '# ports',
        'export WEB_PORT=5173',
        'API_PORT="3001" # quoted',
        "NAME='a # b'",
        'PLAIN=x # note',
        'WEB_PORT=5174',
        'not a line',
      ].join('\n'),
    )
    assert.deepEqual(Object.fromEntries(values), {
      WEB_PORT: '5174',
      API_PORT: '3001',
      NAME: 'a # b',
      PLAIN: 'x',
    })
  })
})

describe('a port check', () => {
  const fromEnv = { file: '.env', key: 'WEB_PORT' }

  test('is up when a listener on the env file’s port works inside the checkout', () => {
    assert.deepEqual(
      portState(
        fromEnv,
        machine(),
        place(LINKED, { readEnv: env('WEB_PORT=5173') }),
      ),
      { state: 'up', detail: 'port 5173' },
    )
  })

  test('reads down when the listener works outside it', () => {
    assert.deepEqual(
      portState(
        fromEnv,
        machine(),
        place(PRIMARY, { readEnv: env('WEB_PORT=5173') }),
      ),
      {
        state: 'down',
        detail: 'port 5173 held by another checkout or program',
      },
    )
  })

  test('a nested worktree’s listener is its own, not the primary’s', () => {
    const port = { base: 3000 }
    assert.equal(
      portState(port, machine(), place(NESTED, { index: 1 })).state,
      'up',
    )
    assert.equal(
      portState(port, machine(), place(PRIMARY, { index: 1 })).state,
      'down',
    )
  })

  test('nothing listening is down; a port it can’t work out is unknown', () => {
    assert.deepEqual(
      portState(fromEnv, machine(), place(LINKED, { readEnv: env('X=1') })),
      { state: 'unknown', detail: "no port in .env's WEB_PORT" },
    )
    assert.deepEqual(portState({ base: 9000 }, machine(), place(LINKED)), {
      state: 'down',
      detail: 'nothing on port 9000',
    })
  })

  test('a port of base + index takes the checkout’s index from worktrees.index', () => {
    const config = ConfigSchema.parse({
      worktrees: { index: { file: '.env.worktree', key: 'WORKTREE_INDEX' } },
    })
    const readEnv = env('WORKTREE_INDEX=1')
    const index = readIndex(config, readEnv)
    assert.equal(index, 1)
    assert.deepEqual(
      portState({ base: 3000 }, machine(), place(NESTED, { index })),
      { state: 'up', detail: 'port 3001' },
    )
    const unset = readIndex(config, env(''))
    assert.equal(unset, 'no WORKTREE_INDEX in .env.worktree')
    assert.deepEqual(
      portState({ base: 3000 }, machine(), place(NESTED, { index: unset })),
      { state: 'unknown', detail: 'no WORKTREE_INDEX in .env.worktree' },
    )
    // The env file's key wins over base when it's there.
    assert.equal(
      portState(
        { ...fromEnv, base: 3000 },
        machine(),
        place(LINKED, { index: 1, readEnv: env('WEB_PORT=5173') }),
      ).detail,
      'port 5173',
    )
  })

  test('reads unknown when lsof failed', () => {
    const read = { ...machine(), unreadable: "lsof didn't answer" }
    assert.deepEqual(portState({ base: 5173 }, read, place(LINKED)), {
      state: 'unknown',
      detail: "lsof didn't answer",
    })
  })
})

describe('a compose check', () => {
  const parts = ['postgres', 'redis']

  test('counts the running parts among the containers inside the checkout', () => {
    assert.deepEqual(composeState({ parts }, machine(), place(LINKED)), {
      state: 'partial',
      detail: '1 of 2 containers',
    })
    assert.deepEqual(composeState({ parts }, machine(), place(PRIMARY)), {
      state: 'up',
      detail: '2 of 2 containers',
    })
    assert.deepEqual(composeState({ parts }, machine(), place(NESTED)), {
      state: 'down',
      detail: '0 of 2 containers',
    })
  })

  test('a project with {index} keeps only that project’s containers', () => {
    const compose = { project: 'app_wt{index}', parts }
    assert.equal(
      composeState(compose, machine(), place(LINKED, { index: 1 })).state,
      'partial',
    )
    assert.equal(
      composeState(compose, machine(), place(PRIMARY, { index: 1 })).state,
      'down',
    )
  })

  test('reads unknown when docker isn’t answering', () => {
    const read: Machine = {
      ...machine(),
      containers: { ok: false, message: "docker isn't installed" },
    }
    assert.deepEqual(composeState({ parts }, read, place(LINKED)), {
      state: 'unknown',
      detail: "docker isn't installed",
    })
  })
})

describe('a process check', () => {
  test('by cwd: a matching process working inside the checkout', () => {
    const worker = { match: 'dist/worker.js', owner: 'cwd' as const }
    assert.deepEqual(processState(worker, machine(), place(PRIMARY)), {
      state: 'up',
      detail: 'pid 404',
    })
    // pid 606 matches too, but its cwd wasn't read: it belongs to no checkout.
    assert.deepEqual(processState(worker, machine(), place(LINKED)), {
      state: 'down',
      detail: 'no process matching dist/worker.js',
    })
  })

  test('by argument: a path of the checkout in its command line, spaces and all', () => {
    const spaced = '/src/My Projects/app'
    const roots = [...ROOTS, spaced]
    const check = { match: 'run.py', owner: 'argument' as const }
    assert.equal(
      processState(check, machine(), place(spaced, { roots })).state,
      'up',
    )
    assert.equal(
      processState(check, machine(), place(PRIMARY, { roots })).state,
      'down',
    )
    assert.equal(
      argumentOwner('vite --config=/src/app/.worktrees/wt2/vite.ts', ROOTS),
      NESTED,
    )
    assert.equal(argumentOwner('cat /src/app-other/x', ROOTS), null)
  })
})

describe('a command check', () => {
  test('from a repo’s committed config, it isn’t run', async () => {
    const dir = tempDir()
    assert.deepEqual(await commandState('touch ran', place(dir), false), {
      state: 'unknown',
      detail: UNTRUSTED_COMMAND,
    })
    assert.equal(existsSync(join(dir, 'ran')), false)
  })

  test('from the personal config, exit 0 is up, in the checkout, with {index} filled', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'marker'), '')
    assert.deepEqual(
      await commandState(
        'test -f marker && test {index} = 2',
        place(dir, { index: 2 }),
        true,
      ),
      { state: 'up', detail: null },
    )
    assert.deepEqual(await commandState('exit 3', place(dir), true), {
      state: 'down',
      detail: 'the check exited 3',
    })
  })
})
