import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Ellipsis,
  GripVertical,
  FolderX,
  GitBranch,
  GitPullRequest,
  House,
  Lock,
  Palette,
  Pencil,
  Pin,
  PinOff,
  Play,
  Terminal,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useState, type FormEvent, type ReactElement } from 'react'
import { Link } from 'react-router'

import type { Checkout, RunSummary } from '../../../core/types.ts'
import { RunStateIcon } from '@/components/agents/run-state.tsx'
import { GitSummary } from '@/components/checkouts/git-summary.tsx'
import { ServiceChips } from '@/components/checkouts/service-chips.tsx'
import { Beaver } from '@/components/terminals/beaver.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { Input } from '@/components/ui/input.tsx'
import { swatchFill, swatchTint } from '@/components/ui/swatch-variants.ts'
import { toast } from '@/components/ui/toast-manager.ts'
import { Tip } from '@/components/ui/tooltip.tsx'
import {
  SWATCHES,
  type CheckoutPref,
  type Swatch,
} from '@/lib/checkout-prefs.ts'
import { cn } from '@/lib/utils.ts'

// Whether a `claude` session runs in the worktree, and whether Claude is working in it.
export type TerminalState = 'none' | 'open' | 'busy'

const TERMINAL_TIPS: Record<TerminalState, string> = {
  none: 'Start a Claude Code session here',
  open: 'Go to its Claude Code session',
  busy: 'Claude is working here: go to its session',
}

interface WorktreeRowProps {
  checkout: Checkout
  mainline: string
  pull: { number: number; to: string } | null // the branch's open PR, in the GitHub tab
  pref: CheckoutPref
  onChange: (change: Partial<CheckoutPref>) => void
  latestRun: RunSummary | null
  onRunHere: () => void
  onOpenRun: (id: string) => void
  terminal: TerminalState
  onOpenTerminal: () => void
  onOpenShell: () => void
  onRemove: (() => void) | null // null for the primary checkout
  onMoveUp: (() => void) | null // null at the top of its group
  onMoveDown: (() => void) | null
}

function folderName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

// An icon beside the name that says something about the worktree itself, in words on hover.
function Marker({
  label,
  children,
}: {
  label: string
  children: ReactElement
}) {
  return (
    <Tip label={label}>
      <span className="inline-flex shrink-0 items-center">
        {children}
        <span className="sr-only">{label}</span>
      </span>
    </Tip>
  )
}

export function WorktreeRow({
  checkout,
  mainline,
  pull,
  pref,
  onChange,
  latestRun,
  onRunHere,
  onOpenRun,
  terminal,
  onOpenTerminal,
  onOpenShell,
  onRemove,
  onMoveUp,
  onMoveDown,
}: WorktreeRowProps) {
  const [renaming, setRenaming] = useState(false)
  const folder = folderName(checkout.path)
  const name = pref.nickname ?? folder
  const togglePin = () => onChange({ pinned: pref.pinned ? undefined : true })
  const copyPath = () =>
    void navigator.clipboard.writeText(checkout.path).then(
      () => toast.add({ title: 'Path copied', type: 'success' }),
      () => toast.add({ title: "Couldn't copy the path", type: 'error' }),
    )

  return (
    <li
      data-path={checkout.path}
      className={cn(
        'group relative flex items-center gap-4 py-2.5 pr-3 pl-4 transition-colors',
        swatchTint({ colour: pref.colour ?? 'none' }),
      )}
    >
      {/* Dragged by RepoSection, which listens on the list. The menu's Move items do the same
          from the keyboard. */}
      <span
        draggable
        aria-hidden="true"
        title="Drag to reorder"
        className="absolute inset-y-0 left-0 flex w-4 cursor-grab items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </span>
      <div className="flex min-w-24 flex-1 flex-col gap-0.5">
        {renaming ? (
          <RenameField
            initial={pref.nickname ?? ''}
            placeholder={folder}
            onDone={(nickname) => {
              if (nickname !== null)
                onChange({ nickname: nickname || undefined })
              setRenaming(false)
            }}
          />
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <h3
              className="truncate text-sm font-semibold text-strong"
              title={checkout.path}
            >
              {name}
            </h3>
            {checkout.primary && (
              <Marker label="Primary: the repo's own folder, not a worktree">
                <House className="size-3.5 text-muted-foreground" />
              </Marker>
            )}
            {pref.pinned && (
              <Marker label="Pinned to the top">
                <Pin className="size-3.5 fill-current text-muted-foreground" />
              </Marker>
            )}
            {checkout.locked && (
              <Marker label="Locked: git won't remove it until it's unlocked">
                <Lock className="size-3.5 text-warning" />
              </Marker>
            )}
            {checkout.prunable && (
              <Marker label="Its folder is gone; git still lists it">
                <FolderX className="size-3.5 text-destructive" />
              </Marker>
            )}
          </div>
        )}
        <p className="flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground">
          <GitBranch className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {checkout.branch ?? `detached at ${checkout.head}`}
          </span>
          {pull !== null && (
            <Link
              to={pull.to}
              aria-label={`Open PR #${pull.number}`}
              className="inline-flex shrink-0 items-center gap-0.5 rounded font-semibold text-primary hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            >
              <GitPullRequest className="size-3" aria-hidden="true" />#
              {pull.number}
            </Link>
          )}
        </p>
      </div>

      <div className="hidden w-36 shrink-0 @lg:block">
        {checkout.problem === null ? (
          <GitSummary checkout={checkout} mainline={mainline} />
        ) : (
          <Marker label={checkout.problem}>
            <TriangleAlert className="size-3.5 text-destructive" />
          </Marker>
        )}
      </div>
      <div className="hidden w-12 shrink-0 @2xl:block">
        {checkout.services.length > 0 && (
          <ServiceChips services={checkout.services} />
        )}
      </div>
      <div className="hidden w-44 shrink-0 @4xl:block">
        {latestRun !== null && (
          <Tip label={`Last run ${latestRun.state}. Open its log`}>
            <button
              type="button"
              onClick={() => onOpenRun(latestRun.id)}
              className="flex max-w-full items-center gap-1.5 rounded-md text-left text-xs text-muted-foreground outline-none hover:text-strong focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RunStateIcon state={latestRun.state} />
              <span className="truncate">{latestRun.title}</span>
            </button>
          </Tip>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tip label={pref.pinned ? 'Unpin' : 'Pin to the top'}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={pref.pinned ? `Unpin ${name}` : `Pin ${name}`}
            aria-pressed={pref.pinned === true}
            onClick={togglePin}
            className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            {pref.pinned ? <PinOff /> : <Pin />}
          </Button>
        </Tip>
        {!checkout.prunable && (
          <Tip label={TERMINAL_TIPS[terminal]}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Claude Code in ${name}`}
              onClick={onOpenTerminal}
              className="text-muted-foreground"
            >
              {/* The beaver is a Claude Code session: faded until one runs here. The plain shell is
                  the ⋯ menu's. */}
              <Beaver
                busy={terminal === 'busy'}
                className={cn(
                  terminal === 'none' &&
                    'opacity-50 grayscale transition group-hover/button:opacity-100 group-hover/button:grayscale-0',
                )}
              />
            </Button>
          </Tip>
        )}
        <Tip label="Start an agent or workflow here">
          <Button variant="outline" size="sm" onClick={onRunHere}>
            <Play aria-hidden="true" />
            Run
          </Button>
        </Tip>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`More for ${name}`}
                className="text-muted-foreground"
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={togglePin}>
              {pref.pinned ? <PinOff /> : <Pin />}
              {pref.pinned ? 'Unpin' : 'Pin to top'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <ColourMenu
              colour={pref.colour}
              onPick={(colour) => onChange({ colour })}
            />
            <DropdownMenuItem onClick={copyPath}>
              <Copy />
              Copy path
            </DropdownMenuItem>
            {!checkout.prunable && (
              <DropdownMenuItem onClick={onOpenShell}>
                <Terminal />
                Open a terminal here
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={onMoveUp === null}
              onClick={() => onMoveUp?.()}
            >
              <ArrowUp />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={onMoveDown === null}
              onClick={() => onMoveDown?.()}
            >
              <ArrowDown />
              Move down
            </DropdownMenuItem>
            {onRemove !== null && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onRemove}>
                  <Trash2 />
                  Remove worktree
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

interface ColourMenuProps {
  colour: Swatch | undefined
  onPick: (colour: Swatch | undefined) => void
}

function ColourMenu({ colour, onPick }: ColourMenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette />
        Colour
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-40">
        <DropdownMenuRadioGroup
          value={colour ?? 'none'}
          onValueChange={(value: Swatch | 'none') =>
            onPick(value === 'none' ? undefined : value)
          }
        >
          {(['none', ...SWATCHES] as const).map((swatch) => (
            <DropdownMenuRadioItem key={swatch} value={swatch}>
              <span
                aria-hidden="true"
                className={cn(
                  swatchFill({ colour: swatch }),
                  'size-3 rounded-full',
                  swatch === 'none' && 'border border-dashed border-border',
                )}
              />
              <span className={swatch === 'none' ? undefined : 'capitalize'}>
                {swatch === 'none' ? 'No colour' : swatch}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

interface RenameFieldProps {
  initial: string
  placeholder: string
  onDone: (nickname: string | null) => void // null: cancelled; '' clears the nickname
}

function RenameField({ initial, placeholder, onDone }: RenameFieldProps) {
  const [value, setValue] = useState(initial)
  const save = (event: FormEvent) => {
    event.preventDefault()
    onDone(value.trim())
  }
  return (
    <form onSubmit={save} className="flex items-center gap-1">
      <Input
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- it appears because Rename was just clicked
        autoFocus
        aria-label="Name"
        value={value}
        maxLength={60}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone(null)
        }}
        className="h-7 max-w-64"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label="Save name"
      >
        <Check />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Cancel renaming"
        onClick={() => onDone(null)}
      >
        <X />
      </Button>
    </form>
  )
}
