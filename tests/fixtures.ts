import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after } from 'node:test'

const made: string[] = []

// Top level, so it runs once every test in the importing file has. An after() called from inside a
// before() hook runs as that hook ends, with the tests still to come.
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

// A directory removed once the test file's tests have run. Symlinks resolved: macOS's tmpdir is
// under /var, which is /private/var, and the code under test compares canonical paths.
export function tempDir(): string {
  const dir = realpathSync.native(
    mkdtempSync(join(tmpdir(), 'stack-monitor-test-')),
  )
  made.push(dir)
  return dir
}

// git with an identity and none of the user's signing or hooks: CI has no identity configured,
// and a signing prompt or a global hook would hang or fail a test.
export function git(dir: string, ...args: string[]): string {
  return execFileSync(
    'git',
    [
      '-C',
      dir,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
}

// A repo with one commit on main, so worktrees can be added to it.
export function gitRepo(dir: string): string {
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'first')
  return dir
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value))
}

// A clone of a bare `origin`, with a linked worktree in each state the checkouts read tells apart.
// The primary is on main, level with origin/main, which holds a tracked README.
export function cloneWithOrigin(root: string) {
  const origin = join(root, 'origin.git')
  git(root, 'init', '-q', '--bare', '-b', 'main', origin)
  const primary = join(root, 'app')
  mkdirSync(primary)
  git(primary, 'init', '-q', '-b', 'main')
  writeFileSync(join(primary, 'README'), 'first\n')
  git(primary, 'add', 'README')
  git(primary, 'commit', '-q', '-m', 'first')
  git(primary, 'remote', 'add', 'origin', origin)
  git(primary, 'push', '-q', '-u', 'origin', 'main')
  const worktree = (name: string) => {
    const path = join(root, `app-${name}`)
    git(primary, 'worktree', 'add', '-q', '-b', name, path, 'origin/main')
    return path
  }
  const commit = (dir: string, message: string) =>
    git(dir, 'commit', '-q', '--allow-empty', '-m', message)
  // Cut before main moves on, so it ends behind by the merged commit and the merge.
  const behind = worktree('behind')
  // Merged into main with a merge commit, so its HEAD is off main's first-parent line.
  const merged = worktree('merged')
  commit(merged, 'merged work')
  git(primary, 'merge', '-q', '--no-ff', '-m', 'merge merged', 'merged')
  git(primary, 'push', '-q', 'origin', 'main')
  const ahead = worktree('ahead')
  commit(ahead, 'ahead work')
  // A changed tracked file and an untracked one.
  const changed = worktree('changed')
  writeFileSync(join(changed, 'README'), 'changed\n')
  writeFileSync(join(changed, 'new.txt'), 'new\n')
  return { origin, primary, behind, merged, ahead, changed }
}
