import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { StackInput } from '../../core/config/schema.ts'
import type { ActionResult, RepoStack } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { checkoutsKey } from '@/hooks/use-checkouts.ts'
import { reposKey } from '@/hooks/use-repos.ts'
import { getJson, postAction } from '@/lib/api.ts'

export const repoStackKey = (root: string) => ['repo-stack', root] as const

interface UseRepoStackResult {
  repoStack: RepoStack | null
  isPending: boolean
  error: Error | null
  saveStack: (stack: StackInput | null) => Promise<ActionResult>
  isSaving: boolean
}

// One repo's stack as its config in effect has it, and Save, which writes this machine's own copy.
export function useRepoStack(root: string): UseRepoStackResult {
  const queryClient = useQueryClient()
  const { data, isPending, error } = useQuery({
    queryKey: repoStackKey(root),
    queryFn: () =>
      getJson<RepoStack>(`/api/repos/stack?root=${encodeURIComponent(root)}`),
  })
  const save = useMutation({
    mutationFn: (stack: StackInput | null) =>
      postAction('/api/repos/stack', { root, stack }),
    onSuccess: (result) =>
      toast.add({ title: result.message, type: 'success' }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: repoStackKey(root) }),
        queryClient.invalidateQueries({ queryKey: reposKey }),
        queryClient.invalidateQueries({ queryKey: checkoutsKey }),
      ]),
  })
  const { mutateAsync: saveStack, isPending: isSaving } = save
  return useMemo(
    () => ({ repoStack: data ?? null, isPending, error, saveStack, isSaving }),
    [data, isPending, error, saveStack, isSaving],
  )
}
