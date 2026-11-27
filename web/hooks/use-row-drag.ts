import { useCallback, useMemo, useState, type DragEvent } from 'react'

import type { Place } from '@/lib/row-order.ts'

interface UseRowDragOptions {
  canMove: (id: string, target: string, place: Place) => boolean
  onMove: (id: string, target: string, place: Place) => void
}

interface UseRowDragResult {
  dropTop: number | null // where the drop line shows, from the top of the handlers' element
  handlers: {
    onDragStart: (event: DragEvent) => void
    onDragOver: (event: DragEvent) => void
    onDrop: (event: DragEvent) => void
    onDragEnd: () => void
    onDragLeave: (event: DragEvent) => void
  }
}

interface Drop {
  target: string
  place: Place
  top: number
}

// The row a drag event is over, and which half of it.
function rowAt(
  event: DragEvent,
): { id: string; place: Place; row: Element } | null {
  const row = (event.target as Element).closest('li[data-row]')
  const id = row?.getAttribute('data-row')
  if (row === null || id === null || id === undefined) return null
  const { top, height } = row.getBoundingClientRect()
  return {
    id,
    place: event.clientY < top + height / 2 ? 'before' : 'after',
    row,
  }
}

// Dragging a row of a list to a new place. Each row is an `li` whose `data-row` is its id; the
// handlers go on a positioned element around the list, which the drop line is placed in. A drop
// is offered only where canMove says the row would end up somewhere new.
export function useRowDrag({
  canMove,
  onMove,
}: UseRowDragOptions): UseRowDragResult {
  const [dragging, setDragging] = useState<string | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)

  const onDragEnd = useCallback(() => {
    setDragging(null)
    setDrop(null)
  }, [])

  const onDragStart = useCallback((event: DragEvent) => {
    const over = rowAt(event)
    if (over === null) return
    setDragging(over.id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', over.id)
    event.dataTransfer.setDragImage(over.row, 16, 16)
  }, [])

  const onDragOver = useCallback(
    (event: DragEvent) => {
      const over = rowAt(event)
      if (dragging === null || over === null) return
      if (!canMove(dragging, over.id, over.place)) {
        setDrop(null)
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const box = event.currentTarget.getBoundingClientRect()
      const edge = over.row.getBoundingClientRect()
      const top = (over.place === 'before' ? edge.top : edge.bottom) - box.top
      setDrop((current) =>
        current?.target === over.id && current.place === over.place
          ? current
          : { target: over.id, place: over.place, top },
      )
    },
    [dragging, canMove],
  )

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      if (dragging !== null && drop !== null) {
        onMove(dragging, drop.target, drop.place)
      }
      onDragEnd()
    },
    [dragging, drop, onMove, onDragEnd],
  )

  const onDragLeave = useCallback((event: DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDrop(null)
    }
  }, [])

  const dropTop = drop?.top ?? null
  return useMemo(
    () => ({
      dropTop,
      handlers: { onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave },
    }),
    [dropTop, onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave],
  )
}
