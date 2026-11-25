import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type {
  RunSummary,
  StartRunRequest,
  StartRunResult,
} from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { ApiError, getJson, postJson } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

export const runsKey = ['runs'] as const

// A run going changes every couple of seconds; with none going, nothing changes until one starts.
const RUNNING_MS = 2_000
const IDLE_MS = 30_000

interface UseRunsResult {
  runs: RunSummary[]
  isPending: boolean
  error: Error | null
}

// Every recent run, newest first. Pages filter by checkout or repo.
export function useRuns(): UseRunsResult {
  const { data, isPending, error } = useQuery({
    queryKey: runsKey,
    queryFn: () => getJson<RunSummary[]>('/api/runs'),
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.state === 'running')
        ? RUNNING_MS
        : IDLE_MS,
  })
  return useMemo(
    () => ({ runs: data ?? [], isPending, error }),
    [data, isPending, error],
  )
}

// A start answers a StartRunResult; ok: false is a refusal, thrown so onError sees it.
export async function postStart(path: string, body: unknown): Promise<string> {
  const result = await postJson<StartRunResult>(path, body)
  if (!result.ok || result.runId === null) {
    throw new ApiError(200, result.message, result.log)
  }
  return result.runId
}

interface UseStartRunResult {
  start: (path: string, body: unknown) => Promise<string>
  isStarting: boolean
}

// Starts a run through any of the routes that start one (a task, a workflow, a skill draft, a
// prompt improvement) and answers its id.
export function useStartRun(): UseStartRunResult {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      postStart(path, body),
    onError: (failure) => toastFailure("Couldn't start the run", failure),
    onSettled: () => queryClient.invalidateQueries({ queryKey: runsKey }),
  })
  const { mutateAsync, isPending } = mutation
  return useMemo(
    () => ({
      start: (path: string, body: unknown) => mutateAsync({ path, body }),
      isStarting: isPending,
    }),
    [mutateAsync, isPending],
  )
}

export function useStartTask(): {
  startTask: (request: StartRunRequest) => Promise<string>
  isStarting: boolean
} {
  const { start, isStarting } = useStartRun()
  return useMemo(
    () => ({
      startTask: (request: StartRunRequest) => start('/api/runs', request),
      isStarting,
    }),
    [start, isStarting],
  )
}

export function useStopRun(): (id: string) => void {
  const queryClient = useQueryClient()
  const { mutate } = useMutation({
    mutationFn: (id: string) =>
      postJson<{ ok: boolean; message: string }>('/api/runs/stop', { id }),
    onSuccess: (result) =>
      toast.add({
        title: result.message,
        type: result.ok ? 'success' : 'error',
      }),
    onError: (failure) => toastFailure("Couldn't stop the run", failure),
    onSettled: () => queryClient.invalidateQueries({ queryKey: runsKey }),
  })
  return mutate
}
