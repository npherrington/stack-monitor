import { useCallback, useMemo } from 'react'

import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import {
  useReviewMutations,
  type ReviewSessionRequest,
} from '@/hooks/use-review-mutations.ts'

interface UseGithubFlowResult {
  startAgenticReview: (request: ReviewSessionRequest) => Promise<void>
}

// The GitHub page's actions that end somewhere else: an agentic review of a PR ends on its
// session's terminal tab. It rejects when the launch was refused, so the dialog that asked stays
// open and says why.
export function useGithubFlow(
  root: string,
  number: number,
): UseGithubFlowResult {
  const { startSession } = useReviewMutations(root, number)
  const { showSession } = useTerminalLayout()

  const startAgenticReview = useCallback(
    async (request: ReviewSessionRequest) => {
      const session = await startSession(request)
      showSession(session.id)
    },
    [startSession, showSession],
  )

  return useMemo(() => ({ startAgenticReview }), [startAgenticReview])
}
