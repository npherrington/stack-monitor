import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import type { RunResult } from '../core/run.ts'
import type { Runner } from '../core/stack/detect.ts'
import {
  detectWorktreeCommands,
  justRecipes,
  makeTargets,
  worktreeRole,
} from '../core/worktrees/detect.ts'
import { gitRepo, tempDir, writeJson } from './fixtures.ts'

const ENOENT: RunResult = { code: -1, stdout: '', stderr: 'spawn x ENOENT' }

function missingMise(asked: string[][] = []): Runner {
  return async (program, args) => {
    asked.push([program, ...args])
    return ENOENT
  }
}

function miseListing(names: string[]): Runner {
  return async (program) =>
    program === 'mise'
      ? {
          code: 0,
          stdout: JSON.stringify(names.map((name) => ({ name }))),
          stderr: '',
        }
      : ENOENT
}

// Files by path; a value of { exec: text } is written executable.
function repo(files: Record<string, unknown>): string {
  const root = gitRepo(join(tempDir(), 'shop'))
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path)
    mkdirSync(join(file, '..'), { recursive: true })
    if (typeof content === 'string') {
      writeFileSync(file, content)
    } else if (
      typeof content === 'object' &&
      content !== null &&
      'exec' in content
    ) {
      writeFileSync(file, String(content.exec))
      chmodSync(file, 0o755)
    } else {
      writeJson(file, content)
    }
  }
  return root
}

describe('reading a name as a worktree role', () => {
  test('worktree or wt as a word, with setup, teardown or neither', () => {
    assert.equal(worktreeRole('worktree'), 'create')
    assert.equal(worktreeRole('new-worktree'), 'create')
    assert.equal(worktreeRole('wt:new'), 'create')
    assert.equal(worktreeRole('addWorktree'), 'create')
    assert.equal(worktreeRole('worktrees.sh'), 'create')
    assert.equal(worktreeRole('worktree:setup'), 'setup')
    assert.equal(worktreeRole('wt-init'), 'setup')
    assert.equal(worktreeRole('bootstrapWorktree'), 'setup')
    assert.equal(worktreeRole('worktree:remove'), 'teardown')
    assert.equal(worktreeRole('wt-rm'), 'teardown')
    assert.equal(worktreeRole('clean-worktree'), 'teardown')
    assert.equal(worktreeRole('worktree_teardown'), 'teardown')
  })

  test('not about worktrees, or only looking at them', () => {
    assert.equal(worktreeRole('dev'), null)
    assert.equal(worktreeRole('setup'), null)
    assert.equal(worktreeRole('swt'), null)
    assert.equal(worktreeRole('wtf'), null)
    assert.equal(worktreeRole('worktree:list'), null)
    assert.equal(worktreeRole('wt-status'), null)
  })
})

describe('detecting worktree commands', () => {
  test('mise tasks: create with the branch after --, setup and teardown without', async () => {
    const root = repo({})
    const found = await detectWorktreeCommands(
      root,
      miseListing(['dev', 'worktree', 'worktree:setup', 'wt:rm']),
    )
    assert.deepEqual(found, [
      {
        role: 'create',
        command: 'mise run worktree -- {branch}',
        from: 'mise',
        note: 'check that the task takes the branch as its first argument: mise run passes on what follows --',
      },
      {
        role: 'setup',
        command: 'mise run worktree:setup',
        from: 'mise',
        note: null,
      },
      { role: 'teardown', command: 'mise run wt:rm', from: 'mise', note: null },
    ])
  })

  test('mise missing or untrusted: skipped quietly, having only listed', async () => {
    const asked: string[][] = []
    const root = repo({})
    assert.deepEqual(await detectWorktreeCommands(root, missingMise(asked)), [])
    assert.deepEqual(asked, [['mise', 'tasks', '--json']])
    const untrusted: Runner = async () => ({
      code: 1,
      stdout: '',
      stderr: 'mise ERROR Config files in ~/x/mise.toml are not trusted.',
    })
    assert.deepEqual(await detectWorktreeCommands(root, untrusted), [])
  })

  test('package.json scripts run through npm with --, or the lockfile’s manager without', async () => {
    const scripts = {
      dev: 'vite',
      'wt:new': 'node new.js',
      'worktree:init': 'cp .env.example .env',
    }
    const npm = repo({ 'package.json': { scripts } })
    assert.deepEqual(await detectWorktreeCommands(npm, missingMise()), [
      {
        role: 'create',
        command: 'npm run wt:new -- {branch}',
        from: 'package.json',
        note: 'check that the script takes the branch as its first argument: npm run adds it to the end of the script',
      },
      {
        role: 'setup',
        command: 'npm run worktree:init',
        from: 'package.json',
        note: null,
      },
    ])
    const pnpm = repo({ 'package.json': { scripts }, 'pnpm-lock.yaml': '' })
    const found = await detectWorktreeCommands(pnpm, missingMise())
    assert.deepEqual(
      found.map(({ role, command }) => [role, command]),
      [
        ['create', 'pnpm run wt:new {branch}'],
        ['setup', 'pnpm run worktree:init'],
        ['install', 'pnpm install --frozen-lockfile'],
      ],
    )
  })

  test('executable files in scripts/, and not the others', async () => {
    const root = repo({
      'scripts/worktree.sh': { exec: '#!/bin/sh\n' },
      'scripts/setup-worktree': { exec: '#!/bin/sh\n' },
      'scripts/worktree-notes.md': 'not executable',
      'scripts/build.sh': { exec: '#!/bin/sh\n' },
    })
    assert.deepEqual(await detectWorktreeCommands(root, missingMise()), [
      {
        role: 'setup',
        command: 'scripts/setup-worktree',
        from: 'scripts/',
        note: null,
      },
      {
        role: 'create',
        command: 'scripts/worktree.sh {branch}',
        from: 'scripts/',
        note: 'check that the script takes the branch as its first argument',
      },
    ])
  })

  test('Makefile targets, with the branch as BRANCH=', async () => {
    const makefile = [
      'WT_DIR := ../wt',
      'WORKTREE ?= x',
      '.PHONY: worktree wt-clean',
      'worktree: deps',
      '\tgit worktree add $(WT_DIR)/$(BRANCH) -b $(BRANCH)',
      'wt-clean:',
      '\trm -rf $(WT_DIR)',
      '%.o: %.c',
      '# worktree: a comment',
    ].join('\n')
    assert.deepEqual(makeTargets(makefile), ['worktree', 'wt-clean'])
    const root = repo({ Makefile: makefile })
    assert.deepEqual(await detectWorktreeCommands(root, missingMise()), [
      {
        role: 'create',
        command: 'make worktree BRANCH={branch}',
        from: 'Makefile',
        note: 'check that the target reads the branch from $(BRANCH)',
      },
      {
        role: 'teardown',
        command: 'make wt-clean',
        from: 'Makefile',
        note: null,
      },
    ])
  })

  test('justfile recipes, with the branch as an argument', async () => {
    const justfile = [
      'set shell := ["bash", "-c"]',
      'alias wt := worktree',
      'wt_dir := "../wt"',
      '',
      '[group("wt")]',
      'worktree branch base="origin/main":',
      '    git worktree add {{wt_dir}}/{{branch}} -b {{branch}} {{base}}',
      '',
      '@worktree-bootstrap: deps',
      '    cp .env.example .env',
    ].join('\n')
    assert.deepEqual(justRecipes(justfile), ['worktree', 'worktree-bootstrap'])
    const root = repo({ justfile })
    assert.deepEqual(await detectWorktreeCommands(root, missingMise()), [
      {
        role: 'create',
        command: 'just worktree {branch}',
        from: 'justfile',
        note: 'check that the recipe takes the branch as its first parameter',
      },
      {
        role: 'setup',
        command: 'just worktree-bootstrap',
        from: 'justfile',
        note: null,
      },
    ])
  })

  test('an install for each lockfile at the root, and mise install for a mise config', async () => {
    const root = repo({
      'package-lock.json': {},
      'yarn.lock': '',
      'bun.lockb': '',
      'uv.lock': '',
      'poetry.lock': '',
      'Gemfile.lock': '',
      'Cargo.lock': '',
      '.mise.toml': '',
      'packages/web/pnpm-lock.yaml': '',
    })
    const found = await detectWorktreeCommands(root, missingMise())
    assert.deepEqual(
      found.map(({ role, command, from, note }) => [role, command, from, note]),
      [
        ['install', 'npm ci', 'package-lock.json', null],
        ['install', 'yarn install --immutable', 'yarn.lock', null],
        ['install', 'bun install --frozen-lockfile', 'bun.lockb', null],
        ['install', 'uv sync', 'uv.lock', null],
        ['install', 'poetry install', 'poetry.lock', null],
        ['install', 'bundle install', 'Gemfile.lock', null],
        ['install', 'cargo fetch', 'Cargo.lock', null],
        ['install', 'mise install', '.mise.toml', null],
      ],
    )
    const bun = repo({ 'bun.lock': '', 'pnpm-lock.yaml': '' })
    assert.deepEqual(
      (await detectWorktreeCommands(bun, missingMise())).map(
        ({ command }) => command,
      ),
      ['pnpm install --frozen-lockfile', 'bun install --frozen-lockfile'],
    )
  })

  test('this repo: its mise task and its script both make a worktree', async () => {
    const root = join(import.meta.dirname, '..')
    const found = await detectWorktreeCommands(root, miseListing(['worktree']))
    const commands = found.map(({ role, command }) => [role, command])
    for (const expected of [
      ['create', 'mise run worktree -- {branch}'],
      ['create', 'scripts/worktree.sh {branch}'],
      ['install', 'npm ci'],
      ['install', 'mise install'],
    ]) {
      assert.ok(
        commands.some(
          ([role, command]) => role === expected[0] && command === expected[1],
        ),
        `missing ${expected.join(' ')}`,
      )
    }
  })
})
