// The clone the monitor serves: the checkout it reads it through, and its worktrees, primary first.
import { existsSync, realpathSync } from 'node:fs'

import { run } from '../run.ts'

// Symlinks resolved, so two spellings of one directory compare equal (macOS's /var is
// /private/var). A path that's gone stays as given.
export function canonical(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

// The top of the checkout `given` is in: a directory inside a checkout stands for that checkout.
export async function findRepo(
  given: string,
): Promise<{ root: string } | { error: string }> {
  const top = await run('git', ['-C', given, 'rev-parse', '--show-toplevel'])
  return top.code === 0
    ? { root: canonical(top.stdout.trimEnd()) }
    : { error: `${given} isn't inside a git checkout` }
}

// Why a repo listed by its primary checkout can't be read now, or null when it can.
export async function whyUnreadable(root: string): Promise<string | null> {
  if (!existsSync(root)) return `${root} doesn't exist any more`
  const found = await findRepo(root)
  return 'error' in found || found.root !== canonical(root)
    ? `${root} isn't a git checkout any more`
    : null
}

export interface Worktree {
  path: string // as git prints it
  locked: boolean // git worktree lock
  prunable: boolean // its directory is gone
}

// `git worktree list --porcelain`: a block per worktree, the main one first. Each starts with
// `worktree <path>`, then an attribute a line: a bare word (`detached`) or a word and its value
// (`locked <reason>`).
export function parseWorktreeList(porcelain: string): Worktree[] {
  return porcelain.split('\n\n').flatMap((block) => {
    const [first = '', ...rest] = block.split('\n').filter(Boolean)
    if (!first.startsWith('worktree ')) return []
    const attributes = new Set(rest.map((line) => line.split(' ', 1)[0]))
    return [
      {
        path: first.slice('worktree '.length),
        locked: attributes.has('locked'),
        prunable: attributes.has('prunable'),
      },
    ]
  })
}

// Every worktree git knows about for the clone `root` is a checkout of.
export async function listWorktrees(root: string): Promise<Worktree[]> {
  const listed = await run('git', [
    '-C',
    root,
    'worktree',
    'list',
    '--porcelain',
  ])
  if (listed.code !== 0) {
    throw new Error(`git worktree list failed: ${listed.stderr.trim()}`)
  }
  return parseWorktreeList(listed.stdout)
}

// The primary checkout: the one that isn't linked, which git lists first.
export async function primaryRoot(root: string): Promise<string> {
  const [first] = await listWorktrees(root)
  if (first === undefined) {
    throw new Error(`git worktree list names no worktree for ${root}`)
  }
  return canonical(first.path)
}
