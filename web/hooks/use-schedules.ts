import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type {
  SaveScheduleRequest,
  SaveScheduleResult,
  ScheduleView,
} from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { runsKey } from '@/hooks/use-runs.ts'
import { getJson, postAction, postJson } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

const schedulesKey = ['schedules'] as const

interface UseSchedulesResult {
  schedules: ScheduleView[]
  isPending: boolean
  error: Error | null
  saveSchedule: (request: SaveScheduleRequest) => Promise<SaveScheduleResult>
  deleteSchedule: (id: string) => void
  runNow: (id: string) => Promise<string>
  isRunning: boolean
}

// Every schedule, refreshed every 30 s so the next fires and the fire log stay current.
export function useSchedules(): UseSchedulesResult {
  const queryClient = useQueryClient()
  const { data, isPending, error } = useQuery({
    queryKey: schedulesKey,
    queryFn: () => getJson<ScheduleView[]>('/api/schedules'),
    refetchInterval: 30_000,
  })
  const settle = () => queryClient.invalidateQueries({ queryKey: schedulesKey })
  const save = useMutation({
    mutationFn: (request: SaveScheduleRequest) =>
      postJson<SaveScheduleResult>('/api/schedules/save', request),
    onSuccess: (result) => {
      if (result.blocked === null) {
        toast.add({ title: result.message, type: 'success' })
      }
    },
    onSettled: settle,
  })
  const remove = useMutation({
    mutationFn: (id: string) => postAction('/api/schedules/delete', { id }),
    onSuccess: (result) =>
      toast.add({ title: result.message, type: 'success' }),
    onError: (failure) => toastFailure("Couldn't delete it", failure),
    onSettled: settle,
  })
  const fire = useMutation({
    mutationFn: async (id: string) => {
      const result = await postJson<{ runId: string | null }>(
        '/api/schedules/run',
        { id },
      )
      return result.runId ?? ''
    },
    onError: (failure) => toastFailure("Couldn't start it", failure),
    onSettled: () => {
      void settle()
      void queryClient.invalidateQueries({ queryKey: runsKey })
    },
  })
  const { mutateAsync: saveSchedule } = save
  const { mutate: deleteSchedule } = remove
  const { mutateAsync: runNow, isPending: isRunning } = fire
  return useMemo(
    () => ({
      schedules: data ?? [],
      isPending,
      error,
      saveSchedule,
      deleteSchedule,
      runNow,
      isRunning,
    }),
    [data, isPending, error, saveSchedule, deleteSchedule, runNow, isRunning],
  )
}
