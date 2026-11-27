import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
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

  test('no mise on PATH is refused', async () => {
    const { primary } = cloneWithOrigin(tempDir())
    const message = refusal(
      await decide(primary, 'stack-monitor-test-no-such-program'),
    )
    assert.match(message, /mise isn't on the app's PATH/)
  })
})
