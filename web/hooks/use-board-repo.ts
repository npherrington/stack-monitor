import { useMemo, useState } from 'react'

import type { RepoCheckouts } from '../../core/types.ts'
import { useCheckouts } from '@/hooks/use-checkouts.ts'
import { readLastRepo } from '@/lib/board-prefs.ts'

interface UseBoardRepoResult {
  repos: RepoCheckouts[] // the tracked repos a session can start in
  repo: RepoCheckouts | undefined // the one picked; undefined when there is none to pick
  pickRepo: (root: string) => void
  isPending: boolean
  error: Error | null
}

// Which repo a session started from the board runs in: the one picked in the dialog, else the one
// last used for this project in this browser, else the first. A ticket belongs to no repo, so the
// dialog asks; a repo that can't be read isn't offered.
export function useBoardRepo(project: number): UseBoardRepoResult {
  const { repos: all, isPending, error } = useCheckouts()
  const [picked, pickRepo] = useState<string | null>(() =>
    readLastRepo(project),
  )
  const repos = useMemo(
    () =>
      all.filter((each) => each.problem === null && each.checkouts.length > 0),
    [all],
  )
  const repo = repos.find((each) => each.root === picked) ?? repos[0]
  return useMemo(
    () => ({ repos, repo, pickRepo, isPending, error }),
    [repos, repo, isPending, error],
  )
}
