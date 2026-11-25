import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ActionResult, Workflow, WorkflowList } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { getJson, postAction } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

const workflowsKey = (root: string | null) => ['workflows', root] as const

interface UseWorkflowsResult {
  list: WorkflowList | null
  isPending: boolean
  error: Error | null
  saveWorkflow: (
    workflow: Workflow,
    replacing: string | null,
  ) => Promise<ActionResult>
  deleteWorkflow: (name: string) => void
}

// A repo's saved workflows (.agents/workflows/*.json), and saving and deleting them.
export function useWorkflows(root: string | null): UseWorkflowsResult {
  const queryClient = useQueryClient()
  const { data, isPending, error } = useQuery({
    queryKey: workflowsKey(root),
    queryFn: () =>
      getJson<WorkflowList>(
        `/api/workflows?root=${encodeURIComponent(root ?? '')}`,
      ),
    enabled: root !== null,
  })
  const settle = () =>
    queryClient.invalidateQueries({ queryKey: workflowsKey(root) })
  const save = useMutation({
    mutationFn: ({
      workflow,
      replacing,
    }: {
      workflow: Workflow
      replacing: string | null
    }) =>
      postAction('/api/workflows/save', {
        root,
        workflow,
        replacing: replacing ?? undefined,
      }),
    onSuccess: (result) =>
      toast.add({ title: result.message, type: 'success' }),
    onSettled: settle,
  })
  const remove = useMutation({
    mutationFn: (name: string) =>
      postAction('/api/workflows/delete', { root, name }),
    onSuccess: (result) =>
      toast.add({ title: result.message, type: 'success' }),
    onError: (failure) => toastFailure("Couldn't delete the workflow", failure),
    onSettled: settle,
  })
  const { mutateAsync } = save
  const { mutate: deleteWorkflow } = remove
  return useMemo(
    () => ({
      list: data ?? null,
      isPending: root !== null && isPending,
      error,
      saveWorkflow: (workflow: Workflow, replacing: string | null) =>
        mutateAsync({ workflow, replacing }),
      deleteWorkflow,
    }),
    [data, isPending, error, mutateAsync, deleteWorkflow, root],
  )
}
