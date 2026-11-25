import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ActionResult, RepoStatus } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { getJson, postAction } from '@/lib/api.ts'
import { checkoutsKey } from '@/hooks/use-checkouts.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

export const reposKey = ['repos'] as const

interface UseReposResult {
  repos: RepoStatus[]
  isPending: boolean
  error: Error | null
  addRepo: (input: { path: string; name?: string }) => Promise<ActionResult>
  removeRepo: (root: string) => void
  renameRepo: (root: string, name: string) => void
  isAdding: boolean
}

// The tracked repos with each one's config as read now. Every change also changes the checkouts.
export function useRepos(): UseReposResult {
  const queryClient = useQueryClient()
  const { data, isPending, error } = useQuery({
    queryKey: reposKey,
    queryFn: () => getJson<RepoStatus[]>('/api/repos'),
  })

  const settle = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: reposKey }),
      queryClient.invalidateQueries({ queryKey: checkoutsKey }),
    ])

  const add = useMutation({
    mutationFn: (input: { path: string; name?: string }) =>
      postAction('/api/repos', input),
    onSuccess: (result) =>
      toast.add({ title: result.message, type: 'success' }),
    onSettled: settle,
  })
  const remove = useMutation({
    mutationFn: (root: string) => postAction('/api/repos/remove', { root }),
    onSuccess: (result) =>
      toast.add({ title: result.message, type: 'success' }),
    onError: (failure) => toastFailure("Couldn't remove the repo", failure),
    onSettled: settle,
  })
  const rename = useMutation({
    mutationFn: ({ root, name }: { root: string; name: string }) =>
      postAction('/api/repos/rename', { root, name }),
    onError: (failure) => toastFailure("Couldn't rename the repo", failure),
    onSettled: settle,
  })

  const { mutateAsync: addRepo, isPending: isAdding } = add
  const { mutate: removeRepo } = remove
  const { mutate: renameMutate } = rename

  return useMemo(
    () => ({
      repos: data ?? [],
      isPending,
      error,
      addRepo,
      removeRepo,
      renameRepo: (root: string, name: string) => renameMutate({ root, name }),
      isAdding,
    }),
    [data, isPending, error, addRepo, removeRepo, renameMutate, isAdding],
  )
}
