import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import type {
  ActionResult,
  DiffSide,
  ReviewEvent,
  TerminalSession,
} from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { checkoutsKey } from '@/hooks/use-checkouts.ts'
import { terminalsKey } from '@/hooks/use-terminals.ts'
import { postAction, postSession } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'
import { pullKey } from '@/hooks/use-pull.ts'
import { pullsKey } from '@/hooks/use-pulls.ts'

export interface LineComment {
  path: string
  line: number
  side: DiffSide
  body: string
}

// What the Agentic review dialog chose. path null: a review worktree the monitor makes or moves.
export interface ReviewSessionRequest {
  path: string | null
  skill: string | null
  focus: string
}

interface UseReviewMutationsResult {
  comment: (comment: LineComment) => Promise<ActionResult>
  reply: (thread: string, body: string) => Promise<ActionResult>
  resolve: (thread: string, resolved: boolean) => void
  deleteComment: (comment: string) => void
  submit: (event: ReviewEvent, body: string) => Promise<ActionResult>
  startSession: (request: ReviewSessionRequest) => Promise<TerminalSession>
  isResolving: boolean
  isDeleting: boolean
}

const success = (result: ActionResult) =>
  toast.add({ title: result.message, type: 'success' })

// Reviewing one PR. Every action refreshes the PR, since GitHub holds the pending review; a
// submit also refreshes the list, whose review decision it may change. An agentic review opens a
// terminal session, in a worktree it may have made, so it refreshes those lists instead. The forms
// await comment, reply, submit and startSession, and raise the failure toast themselves so they
// can keep what was typed.
export function useReviewMutations(
  root: string,
  number: number,
): UseReviewMutationsResult {
  const queryClient = useQueryClient()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: pullKey(root, number) })
  const comment = useMutation({
    mutationFn: (line: LineComment) =>
      postAction('/api/github/comment', { root, number, ...line }),
    onSuccess: success,
    onSettled: refresh,
  })
  const reply = useMutation({
    mutationFn: ({ thread, body }: { thread: string; body: string }) =>
      postAction('/api/github/reply', { root, number, thread, body }),
    onSuccess: success,
    onSettled: refresh,
  })
  const resolve = useMutation({
    mutationFn: ({ thread, resolved }: { thread: string; resolved: boolean }) =>
      postAction('/api/github/resolve', { root, thread, resolved }),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't change the thread", failure),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) =>
      postAction('/api/github/comment/delete', { root, comment: id }),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't delete the comment", failure),
    onSettled: refresh,
  })
  const submit = useMutation({
    mutationFn: ({ event, body }: { event: ReviewEvent; body: string }) =>
      postAction('/api/github/review', { root, number, event, body }),
    onSuccess: success,
    onSettled: () =>
      Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: pullsKey(root) }),
      ]),
  })

  const session = useMutation({
    mutationFn: (request: ReviewSessionRequest) =>
      postSession('/api/github/agentic-review', { root, number, ...request }),
    onSuccess: (result) =>
      toast.add({
        title: 'Review session opened',
        description: result.message,
        type: 'success',
      }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: terminalsKey }),
        queryClient.invalidateQueries({ queryKey: checkoutsKey }),
      ]),
  })

  const { mutateAsync: addComment } = comment
  const { mutateAsync: addReply } = reply
  const { mutate: changeThread, isPending: isResolving } = resolve
  const { mutate: deleteComment, isPending: isDeleting } = remove
  const { mutateAsync: submitReview } = submit
  const { mutateAsync: openSession } = session
  const startSession = useCallback(
    async (request: ReviewSessionRequest) =>
      (await openSession(request)).session,
    [openSession],
  )
  return useMemo(
    () => ({
      comment: addComment,
      reply: (thread: string, body: string) => addReply({ thread, body }),
      resolve: (thread: string, resolved: boolean) =>
        changeThread({ thread, resolved }),
      deleteComment,
      submit: (event: ReviewEvent, body: string) =>
        submitReview({ event, body }),
      startSession,
      isResolving,
      isDeleting,
    }),
    [
      addComment,
      addReply,
      changeThread,
      deleteComment,
      submitReview,
      startSession,
      isResolving,
      isDeleting,
    ],
  )
}
