import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { AgentSettings, AgentsOverview } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { getJson, postAction } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

export const agentsKey = ['agents'] as const

interface UseAgentsResult {
  overview: AgentsOverview | null
  isPending: boolean
  error: Error | null
  saveSettings: (settings: AgentSettings) => void
  isSaving: boolean
}

// The agent CLIs on this machine as read now (installed, version, models), and this machine's
// choices among them. Refreshes on focus: installing a CLI in a terminal shows when you come back.
export function useAgents(): UseAgentsResult {
  const queryClient = useQueryClient()
  const { data, isPending, error } = useQuery({
    queryKey: agentsKey,
    queryFn: () => getJson<AgentsOverview>('/api/agents'),
  })
  const save = useMutation({
    mutationFn: (settings: AgentSettings) =>
      postAction('/api/agents/settings', settings),
    onSuccess: (result) =>
      toast.add({ title: result.message, type: 'success' }),
    onError: (failure) =>
      toastFailure("Couldn't save the agent settings", failure),
    onSettled: () => queryClient.invalidateQueries({ queryKey: agentsKey }),
  })
  const { mutate: saveSettings, isPending: isSaving } = save
  return useMemo(
    () => ({
      overview: data ?? null,
      isPending,
      error,
      saveSettings,
      isSaving,
    }),
    [data, isPending, error, saveSettings, isSaving],
  )
}
