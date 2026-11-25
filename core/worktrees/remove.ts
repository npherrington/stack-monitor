// Removing a linked worktree that's safe to remove: the repo's teardown first (its containers and
// data), then `git worktree remove`, never --force, then `git branch -d` when asked, which git
// itself refuses for a branch that hasn't reached mainline.
import { z } from 'zod'

import { listRuns } from '../agents/runs.ts'
import { runsDir } from '../agents/run-files.ts'
import { BRANCH, INDEX } from '../config/schema.ts'
import { trackedRepo } from '../config/sections.ts'
import { loadRepoConfig, PathText } from '../repos.ts'
import { run } from '../run.ts'
import type { Tracking } from '../settings.ts'
import { envReader, readIndex } from '../stack/status.ts'
import { failure, type ActionResult } from '../types.ts'
import { canonical, listWorktrees } from './clone.ts'
import { shell, tail } from './create.ts'

export const RemoveWorktreeRequest = z.strictObject({
  root: PathText,
  path: PathText,
  deleteBranch: z.boolean().default(false),
})

// One removal at a time per worktree, so a double click can't run teardown twice.
const removing = new Set<string>()

export async function removeWorktree(
  tracking: Tracking,
  request: z.output<typeof RemoveWorktreeRequest>,
  { runs = runsDir() }: { runs?: string } = {},
): Promise<ActionResult> {
  const repo = trackedRepo(tracking, request.root)
  if ('problem' in repo) return failure(repo.problem)
  if ('refused' in repo) return failure(repo.refused)
  const { root } = repo
  const wanted = canonical(request.path)
  const worktrees = await listWorktrees(root)
  const at = worktrees.findIndex((each) => canonical(each.path) === wanted)
  if (at === -1) return failure(`${request.path} isn't a worktree of ${root}`)
  if (at === 0) {
    return failure(
      `${request.path} is the primary checkout, which the monitor doesn't remove`,
    )
  }
  const worktree = worktrees[at]
  if (worktree.locked) {
    return failure(
      `${worktree.path} is locked (git worktree lock). Unlock it to remove it.`,
    )
  }
  if (worktree.prunable) {
    // Its directory is already gone: only git's record of it is left.
    await run('git', ['-C', root, 'worktree', 'prune'])
    return {
      ok: true,
      message: `Pruned ${worktree.path}, whose folder was already gone`,
      log: null,
    }
  }
  if (removing.has(wanted))
    return failure(`${worktree.path} is already being removed`)
  removing.add(wanted)
  try {
    return await removeChecked(
      tracking,
      root,
      worktree.path,
      request.deleteBranch,
      runs,
    )
  } finally {
    removing.delete(wanted)
  }
}

async function removeChecked(
  tracking: Tracking,
  root: string,
  path: string,
  deleteBranch: boolean,
  runs: string,
): Promise<ActionResult> {
  const going = (await listRuns(runs, root)).find(
    (each) =>
      each.state === 'running' && canonical(each.checkout) === canonical(path),
  )
  if (going !== undefined) {
    return failure(
      `"${going.title}" is running in ${path}. Stop it or wait for it to end.`,
    )
  }
  const status = await run('git', ['-C', path, 'status', '--porcelain'])
  if (status.code !== 0)
    return failure(`git status failed in ${path}: ${tail(status)}`)
  const changed = status.stdout
    .split('\n')
    .filter((line) => line.trim() !== '').length
  if (changed > 0) {
    return failure(
      `${path} has ${changed} changed or untracked ${changed === 1 ? 'file' : 'files'}. Commit, stash or delete ${changed === 1 ? 'it' : 'them'} first.`,
    )
  }
  const head = await run('git', [
    '-C',
    path,
    'symbolic-ref',
    '--short',
    '-q',
    'HEAD',
  ])
  const branch = head.code === 0 ? head.stdout.trim() : null

  const loaded = loadRepoConfig(tracking, root)
  if (!loaded.ok) return failure(loaded.problem)
  const { config } = loaded
  const { teardown } = config.worktrees
  if (teardown !== undefined) {
    let command = teardown.replaceAll(BRANCH, branch ?? '')
    if (command.includes(INDEX)) {
      const index = readIndex(config, envReader(path))
      if (typeof index !== 'number') {
        return failure(
          `Teardown needs the worktree's index: ${index ?? 'none set'}`,
        )
      }
      command = command.replaceAll(INDEX, String(index))
    }
    const tornDown = await shell(command, path)
    if (tornDown.code !== 0) {
      return failure(
        `Teardown failed, so nothing was removed: ${tail(tornDown)}`,
      )
    }
  }

  const removed = await run('git', ['-C', root, 'worktree', 'remove', path])
  if (removed.code !== 0)
    return failure(`git worktree remove failed: ${tail(removed)}`)
  if (!deleteBranch || branch === null) {
    return {
      ok: true,
      message:
        branch === null ? `Removed ${path}` : `Removed ${path}; kept ${branch}`,
      log: null,
    }
  }
  const deleted = await run('git', ['-C', root, 'branch', '-d', branch])
  return {
    ok: true,
    message:
      deleted.code === 0
        ? `Removed ${path} and deleted ${branch}`
        : `Removed ${path}; kept ${branch}, which git won't delete: ${tail(deleted)}`,
    log: null,
  }
}
