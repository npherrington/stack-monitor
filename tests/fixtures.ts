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
