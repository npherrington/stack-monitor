import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { ActionResult, DiffSide, ReviewEvent } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { postAction } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'
import { pullKey } from '@/hooks/use-pull.ts'
import { pullsKey } from '@/hooks/use-pulls.ts'

export interface LineComment {
  path: string
  line: number
  side: DiffSide
  body: string
}

interface UseReviewMutationsResult {
  comment: (comment: LineComment) => Promise<ActionResult>
  reply: (thread: string, body: string) => Promise<ActionResult>
  resolve: (thread: string, resolved: boolean) => void
  deleteComment: (comment: string) => void
  submit: (event: ReviewEvent, body: string) => Promise<ActionResult>
  isResolving: boolean
  isDeleting: boolean
}

const success = (result: ActionResult) =>
  toast.add({ title: result.message, type: 'success' })

// Reviewing one PR. Every action refreshes the PR, since GitHub holds the pending review; a
// submit also refreshes the list, whose review decision it may change. The forms await comment,
// reply and submit, and raise the failure toast themselves so they can keep what was typed.
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

  const { mutateAsync: addComment } = comment
  const { mutateAsync: addReply } = reply
  const { mutate: changeThread, isPending: isResolving } = resolve
  const { mutate: deleteComment, isPending: isDeleting } = remove
  const { mutateAsync: submitReview } = submit
  return useMemo(
    () => ({
      comment: addComment,
      reply: (thread: string, body: string) => addReply({ thread, body }),
      resolve: (thread: string, resolved: boolean) =>
        changeThread({ thread, resolved }),
      deleteComment,
      submit: (event: ReviewEvent, body: string) =>
        submitReview({ event, body }),
      isResolving,
      isDeleting,
    }),
    [
      addComment,
      addReply,
      changeThread,
      deleteComment,
      submitReview,
      isResolving,
      isDeleting,
    ],
  )
}
