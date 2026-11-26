import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type {
  TerminalKind,
  TerminalSession,
  TerminalsSnapshot,
} from '../../core/types.ts'
import { getJson, postAction, postJson } from '@/lib/api.ts'

export const terminalsKey = ['terminals'] as const

export interface TerminalTarget {
  root: string
  path: string
  kind?: TerminalKind // claude unless it says
}

interface UseTerminalsResult {
  sessions: TerminalSession[]
  open: (target: TerminalTarget) => Promise<TerminalSession>
  close: (id: string) => Promise<unknown>
}

// The monitor's terminal sessions. They change only when the page opens or closes one, or one
// exits (which the socket says), so this reads them on load and after each of those.
export function useTerminals(): UseTerminalsResult {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: terminalsKey,
    queryFn: () => getJson<TerminalsSnapshot>('/api/terminals'),
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: terminalsKey })
  const { mutateAsync: open } = useMutation({
    mutationFn: (target: TerminalTarget) =>
      postJson<TerminalSession>('/api/terminals', target),
    onSettled: refresh,
  })
  const { mutateAsync: close } = useMutation({
    mutationFn: (id: string) => postAction('/api/terminals/close', { id }),
    onSettled: refresh,
  })
  return useMemo(
    () => ({ sessions: data?.sessions ?? [], open, close }),
    [data, open, close],
  )
}
