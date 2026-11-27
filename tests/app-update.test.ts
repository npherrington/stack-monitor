import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { decideUpdate, readUpdateState } from '../app/update.ts'
import { cloneWithOrigin, git, tempDir } from './fixtures.ts'

// node answers --version as mise would; the tests don't depend on mise being installed.
const decide = async (root: string, mise = process.execPath) =>
  decideUpdate(await readUpdateState(root, { mise }))

const refusal = (decision: Awaited<ReturnType<typeof decide>>) => {
  assert.equal(decision.kind, 'refuse')
  return decision.kind === 'refuse' ? decision.message : ''
}

describe("updating the app's checkout", () => {
  test('main level with origin/main is up to date', async () => {
    const { primary } = cloneWithOrigin(tempDir())
    assert.deepEqual(await decide(primary), { kind: 'current' })
  })

  test('a commit pushed to origin/main is ready, with that commit as the target', async () => {
    const { primary, behind } = cloneWithOrigin(tempDir())
    git(behind, 'pull', '-q', '--ff-only', 'origin', 'main')
    git(behind, 'commit', '-q', '--allow-empty', '-m', 'new on main')
    git(behind, 'push', '-q', 'origin', 'HEAD:main')
    const pushed = git(behind, 'rev-parse', 'HEAD').trim()
    const decision = await decide(primary)
    assert.equal(decision.kind, 'ready')
    if (decision.kind !== 'ready') return
    assert.equal(decision.target, pushed)
    assert.equal(decision.behind, 1)
    assert.match(decision.commits[0] ?? '', /new on main$/)
  })

  test('another branch is refused, naming it', async () => {
    const { primary } = cloneWithOrigin(tempDir())
    git(primary, 'switch', '-q', '-c', 'topic')
    assert.match(refusal(await decide(primary)), /the branch topic/)
  })

  test('a detached HEAD is refused', async () => {
    const { primary } = cloneWithOrigin(tempDir())
    git(primary, 'switch', '-q', '--detach')
    assert.match(refusal(await decide(primary)), /detached HEAD/)
  })

  test('changed files are refused, naming them', async () => {
    const { primary } = cloneWithOrigin(tempDir())
    writeFileSync(join(primary, 'README'), 'changed\n')
    writeFileSync(join(primary, 'new.txt'), 'new\n')
    const message = refusal(await decide(primary))
    assert.match(message, /README/)
    assert.match(message, /new\.txt/)
  })

  test('a local commit not on origin/main is refused', async () => {
    const { primary } = cloneWithOrigin(tempDir())
    git(primary, 'commit', '-q', '--allow-empty', '-m', 'local only')
    assert.match(refusal(await decide(primary)), /1 commit that origin\/main/)
  })

  test('a fetch that fails is refused', async () => {
    const { primary } = cloneWithOrigin(tempDir())
    git(primary, 'remote', 'set-url', 'origin', join(tempDir(), 'missing.git'))
    assert.match(refusal(await decide(primary)), /git fetch origin main failed/)
  })

  test('origin/main that the fetch leaves unresolved is refused, not up to date', async () => {
    const { primary } = cloneWithOrigin(tempDir())
    // A refspec that doesn't map main: fetching main then writes only FETCH_HEAD.
    git(
      primary,
      'config',
      'remote.origin.fetch',
      '+refs/heads/other:refs/remotes/origin/other',
    )
    git(primary, 'update-ref', '-d', 'refs/remotes/origin/main')
    assert.match(refusal(await decide(primary)), /origin\/main doesn't resolve/)
  })

  test('no mise on PATH is refused', async () => {
    const { primary } = cloneWithOrigin(tempDir())
    const message = refusal(
      await decide(primary, 'stack-monitor-test-no-such-program'),
    )
    assert.match(message, /mise isn't on the app's PATH/)
  })
})

const SCRIPT = join(import.meta.dirname, '..', 'scripts', 'update-app.sh')
const APP = '/Applications/Stack monitor.app'

// A fixture with the script committed on main, as the app's checkout has it, and stand-ins for
// osascript, open and mise that log each call. MISE_FAIL makes the mise call with those
// arguments fail.
function scriptFixture() {
  const root = tempDir()
  const repo = cloneWithOrigin(root)
  mkdirSync(join(repo.primary, 'scripts'))
  copyFileSync(SCRIPT, join(repo.primary, 'scripts', 'update-app.sh'))
  git(repo.primary, 'add', 'scripts')
  git(repo.primary, 'commit', '-q', '-m', 'add the update script')
  git(repo.primary, 'push', '-q', 'origin', 'main')
  git(repo.behind, 'switch', '-q', '--detach', 'origin/main')
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const calls = join(root, 'calls.log')
  const stub = (program: string, body = '') => {
    const path = join(bin, program)
    writeFileSync(
      path,
      `#!/bin/bash\n[ "$1" = - ] && cat >/dev/null\necho "${program} $*" >> "${calls}"\n${body}\n`,
    )
    chmodSync(path, 0o755)
  }
  stub('osascript')
  stub('open')
  stub('mise', '[ "$*" = "${MISE_FAIL:-}" ] && exit 1\nexit 0')
  // Pushed from the second checkout, then fetched into the primary as the app's check would.
  const push = (message: string, file?: string) => {
    if (file !== undefined) {
      mkdirSync(join(repo.behind, file, '..'), { recursive: true })
      writeFileSync(join(repo.behind, file), `${message}\n`)
      git(repo.behind, 'add', file)
    }
    git(repo.behind, 'commit', '-q', '--allow-empty', '-m', message)
    git(repo.behind, 'push', '-q', 'origin', 'HEAD:main')
    git(repo.primary, 'fetch', '-q', 'origin')
    return git(repo.behind, 'rev-parse', 'HEAD').trim()
  }
  const update = (target: string, env: Record<string, string> = {}) => {
    const done = spawnSync('true')
    const result = spawnSync(
      'bash',
      [
        join(repo.primary, 'scripts', 'update-app.sh'),
        target,
        String(done.pid),
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          HOME: root,
          STACK_MONITOR_APP: APP,
          ...env,
        },
      },
    )
    let logged = ''
    try {
      logged = readFileSync(calls, 'utf8')
    } catch {
      // nothing was called
    }
    return { status: result.status, calls: logged }
  }
  const head = () => git(repo.primary, 'rev-parse', 'HEAD').trim()
  return { ...repo, push, update, head }
}

describe('the update script', () => {
  test('fast-forwards to the commit it was given, not a later one, builds and reopens', () => {
    const fixture = scriptFixture()
    const target = fixture.push('first new commit')
    fixture.push('pushed after the dialog')
    const { status, calls } = fixture.update(target)
    assert.equal(status, 0)
    assert.equal(fixture.head(), target)
    assert.equal(calls, `mise run build\nopen ${APP}\n`)
  })

  test('reinstalls the launcher only when install-app.sh changed', () => {
    const fixture = scriptFixture()
    const target = fixture.push('change the launcher', 'scripts/install-app.sh')
    const { status, calls } = fixture.update(target)
    assert.equal(status, 0)
    assert.equal(calls, `mise run build\nmise run install-app\nopen ${APP}\n`)
  })

  test('a checkout on another branch by then is left alone and the app reopened', () => {
    const fixture = scriptFixture()
    const target = fixture.push('new on main')
    git(fixture.primary, 'switch', '-q', '-c', 'topic')
    const before = fixture.head()
    const { status, calls } = fixture.update(target)
    assert.equal(status, 1)
    assert.equal(fixture.head(), before)
    assert.match(
      calls,
      /^osascript - Stack monitor wasn't updated .*on topic now/,
    )
    assert.doesNotMatch(calls, /mise/)
    assert.match(calls, /open \/Applications\/Stack monitor\.app\n$/)
  })

  test('changed files by then are left alone', () => {
    const fixture = scriptFixture()
    const target = fixture.push('new on main')
    writeFileSync(join(fixture.primary, 'README'), 'changed\n')
    const before = fixture.head()
    const { status, calls } = fixture.update(target)
    assert.equal(status, 1)
    assert.equal(fixture.head(), before)
    assert.match(calls, /has changed files now/)
  })

  test('a failed build says so after the merge, and opens nothing unless asked', () => {
    const fixture = scriptFixture()
    const target = fixture.push('new on main')
    const { status, calls } = fixture.update(target, { MISE_FAIL: 'run build' })
    assert.equal(status, 1)
    assert.equal(fixture.head(), target)
    assert.match(
      calls,
      /osascript - Stack monitor didn't finish updating mise run build failed/,
    )
    assert.doesNotMatch(calls, /^open /m)
  })

  test('started from a terminal, it says how to start again instead of reopening', () => {
    const fixture = scriptFixture()
    const target = fixture.push('new on main')
    const { status, calls } = fixture.update(target, { STACK_MONITOR_APP: '' })
    assert.equal(status, 0)
    assert.match(calls, /osascript - Stack monitor updated .*mise run app/)
    assert.doesNotMatch(calls, /^open /m)
  })
})
