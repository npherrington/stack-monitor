// Finding the git repos under a folder, for the page to offer as repos to track. Reads only.
import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { expandHome } from './repos.ts'
import { run } from './run.ts'
import { errorMessage, type ScanHit, type ScanResult } from './types.ts'
import { canonical, parseWorktreeList } from './worktrees/clone.ts'

const MAX_DEPTH = 3 // the folder's children are 1 deep
const SKIPPED = new Set(['node_modules', 'Library'])
const GIT_AT_ONCE = 8

export interface ScanLimits {
  maxHits: number
  timeMs: number // roughly: a git call under way when it runs out is given what's left
}

const LIMITS: ScanLimits = { maxHits: 200, timeMs: 3000 }

interface Found {
  repos: string[] // dirs holding a .git dir
  worktrees: string[] // dirs holding a .git file: linked worktrees, each counted under its repo
  truncated: boolean
}

// Breadth first, so a limit cuts off the deepest. Doesn't descend into a checkout it found, follow
// a symlink, or look in a dot-dir.
async function walk(
  folder: string,
  deadline: number,
  maxRepos: number,
): Promise<Found> {
  const found: Found = { repos: [], worktrees: [], truncated: false }
  const queue = [{ dir: folder, depth: 0 }]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (Date.now() > deadline || found.repos.length >= maxRepos) {
      found.truncated = true
      break
    }
    const { dir, depth } = next
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    const git = entries.find((entry) => entry.name === '.git')
    if (git?.isDirectory()) {
      found.repos.push(dir)
      continue
    }
    if (git?.isFile()) {
      found.worktrees.push(dir)
      continue
    }
    if (depth === MAX_DEPTH) continue
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        !SKIPPED.has(entry.name)
      ) {
        queue.push({ dir: join(dir, entry.name), depth: depth + 1 })
      }
    }
  }
  return found
}

interface Clone {
  root: string // its primary checkout
  worktrees: number
}

// The clone the checkout at dir belongs to, or null when git can't say in the time left.
async function cloneOf(dir: string, deadline: number): Promise<Clone | null> {
  const timeMs = deadline - Date.now()
  if (timeMs <= 0) return null
  const listed = await run(
    'git',
    ['-C', dir, 'worktree', 'list', '--porcelain'],
    { timeoutMs: timeMs },
  )
  if (listed.code !== 0) return null
  const worktrees = parseWorktreeList(listed.stdout)
  if (worktrees.length === 0) return null
  return { root: canonical(worktrees[0].path), worktrees: worktrees.length }
}

async function clonesOf(dirs: string[], deadline: number): Promise<Clone[]> {
  const clones: Clone[] = []
  for (let at = 0; at < dirs.length; at += GIT_AT_ONCE) {
    const batch = dirs.slice(at, at + GIT_AT_ONCE)
    const read = await Promise.all(batch.map((dir) => cloneOf(dir, deadline)))
    clones.push(...read.filter((clone) => clone !== null))
  }
  return clones
}

// tracked: the roots already in the list.
export async function scanFolder(
  given: string,
  tracked: ReadonlySet<string>,
  { maxHits, timeMs }: ScanLimits = LIMITS,
): Promise<ScanResult | { error: string }> {
  const folder = canonical(expandHome(given))
  try {
    if (!(await stat(folder)).isDirectory()) {
      return { error: `${folder} isn't a folder` }
    }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { error: `${folder} doesn't exist` }
      : { error: `Couldn't read ${folder}: ${errorMessage(error)}` }
  }
  const deadline = Date.now() + timeMs
  const found = await walk(folder, deadline, maxHits)
  const checkouts = [...found.repos, ...found.worktrees]
  const clones = await clonesOf(checkouts, deadline)
  const byRoot = new Map(clones.map((clone) => [clone.root, clone]))
  const hits: ScanHit[] = [...byRoot.values()]
    .sort((a, b) => a.root.localeCompare(b.root))
    .map(({ root, worktrees }) => ({
      root,
      name: basename(root),
      worktrees,
      tracked: tracked.has(root),
    }))
  // A checkout git couldn't read in time is one left unlooked at, as is any hit over the cap.
  const outOfTime = Date.now() > deadline && clones.length < checkouts.length
  return {
    folder,
    hits: hits.slice(0, maxHits),
    truncated: found.truncated || outOfTime || hits.length > maxHits,
  }
}
