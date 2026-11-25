import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { WorktreesInput } from '../../core/config/schema.ts'
import type { ActionResult, RepoWorktrees } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { reposKey } from '@/hooks/use-repos.ts'
import { getJson, postAction } from '@/lib/api.ts'

export const repoWorktreesKey = (root: string) =>
  ['repo-worktrees', root] as const

interface UseRepoWorktreesResult {
  repoWorktrees: RepoWorktrees | null
  isPending: boolean
  error: Error | null
  saveWorktrees: (worktrees: WorktreesInput) => Promise<ActionResult>
}

// How one repo makes worktrees, and Save, which writes this machine's own config.
export function useRepoWorktrees(root: string): UseRepoWorktreesResult {
  const queryClient = useQueryClient()
  const { data, isPending, error } = useQuery({
    queryKey: repoWorktreesKey(root),
    queryFn: () =>
      getJson<RepoWorktrees>(
        `/api/repos/worktrees?root=${encodeURIComponent(root)}`,
      ),
  })
  const save = useMutation({
    mutationFn: (worktrees: WorktreesInput) =>
      postAction('/api/repos/worktrees', { root, worktrees }),
    onSuccess: (result) =>
      toast.add({ title: result.message, type: 'success' }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: repoWorktreesKey(root) }),
        queryClient.invalidateQueries({ queryKey: reposKey }),
      ]),
  })
  const { mutateAsync: saveWorktrees } = save
  return useMemo(
    () => ({ repoWorktrees: data ?? null, isPending, error, saveWorktrees }),
    [data, isPending, error, saveWorktrees],
  )
}
