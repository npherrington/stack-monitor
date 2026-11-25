import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
  addRepo,
  expandHome,
  readRepoStatuses,
  removeRepo,
  renameRepo,
} from '../core/repos.ts'
import type { Tracking } from '../core/settings.ts'
import { git, gitRepo, tempDir } from './fixtures.ts'

// Whatever the shell running the tests names would be read instead of the fixtures' configs.
delete process.env.STACK_MONITOR_CONFIG

// A seed repo, a second repo with a linked worktree, and a settings file not written yet.
function places() {
  const root = tempDir()
  const seed = gitRepo(join(root, 'seed'))
  const other = gitRepo(join(root, 'other'))
  const linked = join(root, 'other-wt1')
  git(other, 'worktree', 'add', '-q', '-b', 'feature', linked)
  const tracking: Tracking = { settings: join(root, 'conf', 's.json'), seed }
  const written = () => JSON.parse(readFileSync(tracking.settings, 'utf8'))
  return { root, seed, other, linked, tracking, written }
}

describe('the repo list', () => {
  test('~ and ~/... expand to the home directory', () => {
    assert.equal(expandHome('~', '/home/me'), '/home/me')
    assert.equal(expandHome('~/src/app', '/home/me'), '/home/me/src/app')
    assert.equal(expandHome('/abs/~x', '/home/me'), '/abs/~x')
  })

  test('adding writes the file on the first change, the seed first', async () => {
    const { seed, other, tracking, written } = places()
    assert.deepEqual(await addRepo(tracking, { path: other }), {
      ok: true,
      message: `Added other (${other})`,
      log: null,
    })
    assert.deepEqual(written(), {
      repos: [
        { root: seed, name: 'seed' },
        { root: other, name: 'other' },
      ],
    })
  })

  test('adding the seed before anything is written writes nothing', async () => {
    const { seed, tracking } = places()
    const result = await addRepo(tracking, { path: seed })
    assert.equal(result.ok, true)
    assert.equal(result.message, `seed (${seed}) is already in the list`)
    assert.equal(existsSync(tracking.settings), false)
  })

  test('a linked worktree or a folder inside one adds its primary, once', async () => {
    const { other, linked, tracking, written } = places()
    const inside = join(linked, 'src')
    mkdirSync(inside)
    await addRepo(tracking, { path: inside, name: 'Other app' })
    const again = await addRepo(tracking, { path: linked })
    assert.equal(again.ok, true)
    assert.equal(again.message, `Other app (${other}) is already in the list`)
    assert.deepEqual(
      written().repos.map((repo: { root: string }) => repo.root),
      [tracking.seed, other],
    )
  })

  test('refuses a path that does not exist or is not in a checkout', async () => {
    const { root, tracking } = places()
    const missing = join(root, 'nope')
    assert.deepEqual(await addRepo(tracking, { path: missing }), {
      ok: false,
      message: `${missing} doesn't exist`,
      log: null,
    })
    const plain = join(root, 'plain')
    mkdirSync(plain)
    assert.equal(
      (await addRepo(tracking, { path: plain })).message,
      `${plain} isn't inside a git checkout`,
    )
    assert.equal(existsSync(tracking.settings), false)
  })

  test('never overwrites a settings file it cannot read', async () => {
    const { other, tracking } = places()
    mkdirSync(join(tracking.settings, '..'), { recursive: true })
    writeFileSync(tracking.settings, 'not json')
    const result = await addRepo(tracking, { path: other })
    assert.equal(result.ok, false)
    assert.match(
      result.message,
      /isn't JSON: .*\. Fix it or move it aside: the monitor won't overwrite it\.$/,
    )
    assert.equal(readFileSync(tracking.settings, 'utf8'), 'not json')
    for (const act of [
      removeRepo(tracking, { root: tracking.seed }),
      renameRepo(tracking, { root: tracking.seed, name: 'x' }),
    ]) {
      assert.equal((await act).ok, false)
    }
    assert.equal(readFileSync(tracking.settings, 'utf8'), 'not json')
    assert.ok('problem' in (await readRepoStatuses(tracking)))
  })

  test('overlapping adds all land', async () => {
    const { root, tracking, written } = places()
    const repos = ['a', 'b', 'c'].map((name) => gitRepo(join(root, name)))
    await Promise.all(repos.map((path) => addRepo(tracking, { path })))
    assert.equal(written().repos.length, 4)
  })

  test('removing changes the list and nothing on disk', async () => {
    const { seed, tracking, written } = places()
    assert.deepEqual(await removeRepo(tracking, { root: seed }), {
      ok: true,
      message: 'Stopped tracking seed. Nothing on disk changed.',
      log: null,
    })
    assert.deepEqual(written(), { repos: [] })
    assert.ok(existsSync(join(seed, '.git')))
    assert.deepEqual(await removeRepo(tracking, { root: seed }), {
      ok: false,
      message: `${seed} isn't in the list`,
      log: null,
    })
  })

  test('renaming changes only the name, and refuses an unknown root', async () => {
    const { seed, other, tracking, written } = places()
    assert.equal(
      (await renameRepo(tracking, { root: seed, name: 'The seed' })).message,
      'Renamed seed to The seed',
    )
    assert.deepEqual(written(), { repos: [{ root: seed, name: 'The seed' }] })
    assert.deepEqual(await renameRepo(tracking, { root: other, name: 'x' }), {
      ok: false,
      message: `${other} isn't in the list`,
      log: null,
    })
  })

  test("statuses read each repo's config, and say which can't be read", async () => {
    const { root, other, tracking } = places()
    await addRepo(tracking, { path: other })
    writeFileSync(join(other, 'stack-monitor.json'), '{}')
    const unGit = gitRepo(join(root, 'un-git'))
    const deleted = gitRepo(join(root, 'deleted'))
    await addRepo(tracking, { path: unGit })
    await addRepo(tracking, { path: deleted })
    rmSync(join(unGit, '.git'), { recursive: true })
    rmSync(deleted, { recursive: true })
    const statuses = await readRepoStatuses(tracking)
    assert.ok(!('problem' in statuses))
    const [seedStatus, otherStatus, unGitStatus, deletedStatus] = statuses.repos
    assert.equal(seedStatus.problem, null)
    assert.deepEqual(seedStatus.config, {
      ok: true,
      repo: tracking.seed,
      source: null,
      modules: {
        worktrees: true,
        stack: false,
        agents: false,
        featureMap: true,
      },
    })
    assert.equal(
      otherStatus.config?.ok && otherStatus.config.source,
      join(other, 'stack-monitor.json'),
    )
    assert.deepEqual(unGitStatus, {
      root: unGit,
      name: 'un-git',
      config: null,
      problem: `${unGit} isn't a git checkout any more`,
    })
    assert.equal(deletedStatus.problem, `${deleted} doesn't exist any more`)
  })
})
