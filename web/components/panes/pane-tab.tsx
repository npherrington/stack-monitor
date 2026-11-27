import {
  Columns2,
  Ellipsis,
  PanelRight,
  Pencil,
  Rows2,
  Terminal,
  X,
} from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'

import type { TerminalSession } from '../../../core/types.ts'
import { Beaver } from '@/components/terminals/beaver.tsx'
import { ColourMenu } from '@/components/ui/colour-menu.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { Input } from '@/components/ui/input.tsx'
import { swatchTint } from '@/components/ui/swatch-variants.ts'
import { Tip } from '@/components/ui/tooltip.tsx'
import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import type { NoArgCallback } from '@/lib/callbacks.ts'
import { TAB_DRAG_TYPE } from '@/lib/pane-layout.ts'
import { sessionLabel } from '@/lib/session-label.ts'
import { cn } from '@/lib/utils.ts'

interface VirtualAnchor {
  getBoundingClientRect: () => DOMRect
}

interface PaneTabProps {
  session: TerminalSession
  paneId: string
  active: boolean // the tab its pane shows
  paneFocused: boolean
  movable: boolean // splits and dragging, on a screen wide enough for panes
  onSelect: NoArgCallback
  onDragChange: (session: string | null) => void
}

// One session's tab: click to show it, double-click to rename, drag to move it, and a menu (the ⋯
// button, a right-click, or the keyboard's menu key) to rename, colour, split, move or close it.
export function PaneTab({
  session,
  paneId,
  active,
  paneFocused,
  movable,
  onSelect,
  onDragChange,
}: PaneTabProps) {
  const { busy, tabStyles, close, split, moveTab, styleTab } =
    useTerminalLayout()
  const [menuOpen, setMenuOpen] = useState(false)
  const [anchor, setAnchor] = useState<VirtualAnchor | null>(null)
  const [renaming, setRenaming] = useState(false)
  const tab = useRef<HTMLDivElement>(null)
  const style = tabStyles[session.id] ?? {}
  const label = sessionLabel(session, style)
  const exited = session.exitCode !== null
  const working = busy.has(session.id)

  const rename = (name: string | null) => {
    setRenaming(false)
    if (name !== null) styleTab(session.id, { ...style, name })
  }

  return (
    <div
      ref={tab}
      draggable={movable && !renaming}
      onDragStart={(event) => {
        event.dataTransfer.setData(TAB_DRAG_TYPE, session.id)
        event.dataTransfer.effectAllowed = 'move'
        onDragChange(session.id)
      }}
      onDragEnd={() => onDragChange(null)}
      onContextMenu={(event) => {
        event.preventDefault()
        // The keyboard's menu key fires this at 0,0: the menu opens at the tab instead.
        const { clientX: x, clientY: y } = event
        setAnchor(
          x === 0 && y === 0
            ? null
            : {
                getBoundingClientRect: () =>
                  DOMRect.fromRect({ x, y, width: 0, height: 0 }),
              },
        )
        setMenuOpen(true)
      }}
      data-tab={session.id}
      className={cn(
        'group relative flex shrink-0 items-center rounded-md text-sm transition-colors',
        active
          ? paneFocused
            ? 'bg-muted text-strong'
            : 'bg-muted/60 text-foreground'
          : 'text-muted-foreground hover:bg-muted/50',
        style.colour !== undefined && swatchTint({ colour: style.colour }),
        active && style.colour !== undefined && 'ring-1 ring-foreground/25',
      )}
    >
      {renaming ? (
        <TabNameField
          initial={style.name ?? ''}
          placeholder={sessionLabel(session)}
          onDone={rename}
        />
      ) : (
        <button
          type="button"
          role="tab"
          id={`tab-${session.id}`}
          aria-selected={active}
          aria-controls={`panel-${paneId}`}
          tabIndex={active ? 0 : -1}
          title={session.path}
          onClick={() => onSelect()}
          onDoubleClick={() => setRenaming(true)}
          className="flex items-center gap-1.5 rounded-md py-1 pr-1 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {session.kind === 'shell' ? (
            <Terminal
              aria-hidden="true"
              className={cn('size-4 shrink-0', exited && 'opacity-40')}
            />
          ) : (
            <Beaver
              busy={working}
              className={cn(exited && 'opacity-40 grayscale')}
            />
          )}
          <span className="max-w-40 truncate">{label}</span>
          {exited ? (
            <span className="sr-only">(exited)</span>
          ) : (
            working && <span className="sr-only">(working)</span>
          )}
        </button>
      )}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          onClick={() => setAnchor(null)}
          render={
            <button
              type="button"
              aria-label={`More for ${label}`}
              className={cn(
                'rounded p-0.5 opacity-0 outline-none group-hover:opacity-60 hover:bg-background hover:opacity-100! focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:opacity-100',
                active && 'opacity-60',
              )}
            />
          }
        >
          <Ellipsis className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          anchor={anchor ?? undefined}
          align="start"
          className="w-48"
        >
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <Pencil />
            Rename
          </DropdownMenuItem>
          <ColourMenu
            colour={style.colour}
            onPick={(colour) => styleTab(session.id, { ...style, colour })}
          />
          {movable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => split(paneId, 'right')}>
                <Columns2 />
                Split right
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => split(paneId, 'bottom')}>
                <Rows2 />
                Split down
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  moveTab(session.id, { beside: paneId, edge: 'right' })
                }
              >
                <PanelRight />
                Move to new pane
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => close(session.id)}
          >
            <X />
            Close
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tip label="End this session">
        <button
          type="button"
          aria-label={`End the session in ${label}`}
          onClick={() => close(session.id)}
          className="mr-1 rounded p-0.5 opacity-60 outline-none hover:bg-background hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      </Tip>
    </div>
  )
}

interface TabNameFieldProps {
  initial: string
  placeholder: string
  onDone: (name: string | null) => void // null: cancelled; '' goes back to the worktree's name
}

function TabNameField({ initial, placeholder, onDone }: TabNameFieldProps) {
  const [value, setValue] = useState(initial)
  const done = useRef(false) // Enter or Escape, then the blur as the field goes: answer once
  const finish = (name: string | null) => {
    if (done.current) return
    done.current = true
    onDone(name)
  }
  const save = (event?: FormEvent) => {
    event?.preventDefault()
    finish(value.trim())
  }
  return (
    <form onSubmit={save} className="py-0.5 pl-1">
      <Input
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- it appears because Rename was just asked for
        autoFocus
        aria-label="Tab name"
        value={value}
        maxLength={60}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => save()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') finish(null)
        }}
        className="h-6 w-36"
      />
    </form>
  )
}
