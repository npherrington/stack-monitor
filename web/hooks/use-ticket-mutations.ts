import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import type {
  CreateTicket,
  MoveTicket,
  SaveComment,
  UpdateTicket,
} from '../../core/board/schema.ts'
import type { ActionResult, CreateTicketResult } from '../../core/types.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { boardKey } from '@/hooks/use-board.ts'
import { postAction, postJson } from '@/lib/api.ts'
import { toastFailure } from '@/lib/toast-failure.ts'

interface UseTicketMutationsResult {
  createTicket: (ticket: CreateTicket) => Promise<CreateTicketResult>
  editTicket: (change: UpdateTicket) => Promise<ActionResult> // a form's Save
  updateTicket: (change: UpdateTicket) => void // a change made straight on the ticket
  moveTicket: (move: MoveTicket) => void
  archiveTicket: (id: number, archived: boolean) => Promise<ActionResult>
  deleteTicket: (id: number) => Promise<ActionResult>
  saveComment: (comment: SaveComment) => Promise<ActionResult>
  deleteComment: (id: number) => Promise<ActionResult>
  isArchiving: boolean // an archive or a restore is on its way
}

const success = (result: ActionResult) =>
  toast.add({ title: result.message, type: 'success' })

// Everything done to a ticket and its comments. A move, and a change made straight on the ticket
// (its priority, colour, date or labels), only speaks up when it fails: the card showing it is the answer.
export function useTicketMutations(): UseTicketMutationsResult {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: boardKey })
  const create = useMutation({
    mutationFn: (ticket: CreateTicket) =>
      postJson<CreateTicketResult>('/api/board/tickets/create', ticket),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't create the ticket", failure),
    onSettled: refresh,
  })
  const edit = useMutation({
    mutationFn: (change: UpdateTicket) =>
      postAction('/api/board/tickets/update', change),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't save the ticket", failure),
    onSettled: refresh,
  })
  const update = useMutation({
    mutationFn: (change: UpdateTicket) =>
      postAction('/api/board/tickets/update', change),
    onError: (failure) => toastFailure("Couldn't change the ticket", failure),
    onSettled: refresh,
  })
  const move = useMutation({
    mutationFn: (to: MoveTicket) => postAction('/api/board/tickets/move', to),
    onError: (failure) => toastFailure("Couldn't move the ticket", failure),
    onSettled: refresh,
  })
  const archive = useMutation({
    mutationFn: (change: { id: number; archived: boolean }) =>
      postAction('/api/board/tickets/archive', change),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't change the ticket", failure),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: number) => postAction('/api/board/tickets/delete', { id }),
    onSuccess: success,
    onError: (failure) => toastFailure("Couldn't delete the ticket", failure),
    // Everything but an open ticket: the only one that can be open is the one just deleted, and
    // reading it again would only find it gone.
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: boardKey,
        predicate: (query) => query.queryKey[1] !== 'ticket',
      }),
  })
  const comment = useMutation({
    mutationFn: (body: SaveComment) =>
      postAction('/api/board/comments/save', body),
    onError: (failure) => toastFailure("Couldn't save the comment", failure),
    onSettled: refresh,
  })
  const uncomment = useMutation({
    mutationFn: (id: number) =>
      postAction('/api/board/comments/delete', { id }),
    onError: (failure) => toastFailure("Couldn't delete the comment", failure),
    onSettled: refresh,
  })

  const { mutateAsync: createTicket } = create
  const { mutateAsync: editTicket } = edit
  const { mutate: updateTicket } = update
  const { mutate: moveTicket } = move
  const { mutateAsync: archiveMutate, isPending: isArchiving } = archive
  const { mutateAsync: deleteTicket } = remove
  const { mutateAsync: saveComment } = comment
  const { mutateAsync: deleteComment } = uncomment
  return useMemo(
    () => ({
      createTicket,
      editTicket,
      updateTicket,
      moveTicket,
      archiveTicket: (id: number, archived: boolean) =>
        archiveMutate({ id, archived }),
      deleteTicket,
      saveComment,
      deleteComment,
      isArchiving,
    }),
    [
      createTicket,
      editTicket,
      updateTicket,
      moveTicket,
      archiveMutate,
      deleteTicket,
      saveComment,
      deleteComment,
      isArchiving,
    ],
  )
}
