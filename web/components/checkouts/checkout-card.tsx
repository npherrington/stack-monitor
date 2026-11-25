import { Check, GitBranch, Palette, Pencil, Pin, PinOff, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { Checkout } from '../../../core/types.ts'
import { GitSummary } from '@/components/checkouts/git-summary.tsx'
import { ServiceChips } from '@/components/checkouts/service-chips.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card } from '@/components/ui/card.tsx'
import { ColourSwatch } from '@/components/ui/colour-swatch.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Pill } from '@/components/ui/pill.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover.tsx'
import { swatchFill } from '@/components/ui/swatch-variants.ts'
import {
  SWATCHES,
  type CheckoutPref,
  type Swatch,
} from '@/lib/checkout-prefs.ts'
import { cn } from '@/lib/utils.ts'

interface CheckoutCardProps {
  checkout: Checkout
  mainline: string
  pref: CheckoutPref
  onChange: (change: Partial<CheckoutPref>) => void
}

function folderName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function CheckoutCard({
  checkout,
  mainline,
  pref,
  onChange,
}: CheckoutCardProps) {
  const [renaming, setRenaming] = useState(false)
  const folder = folderName(checkout.path)
  const name = pref.nickname ?? folder

  return (
    <Card className="relative gap-3 pt-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <span
        aria-hidden="true"
        className={cn(
          swatchFill({ colour: pref.colour ?? 'none' }),
          'absolute inset-x-0 top-0 h-1.5',
        )}
      />
      <div className="flex items-start gap-2 px-4">
        <div className="min-w-0 flex-1">
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
            <h3
              className="truncate text-base font-extrabold text-strong"
              title={name}
            >
              {name}
            </h3>
          )}
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {checkout.branch ?? `detached at ${checkout.head}`}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={pref.pinned ? `Unpin ${name}` : `Pin ${name}`}
            aria-pressed={pref.pinned === true}
            onClick={() => onChange({ pinned: pref.pinned ? undefined : true })}
            className={pref.pinned ? 'text-strong' : 'text-muted-foreground'}
          >
            {pref.pinned ? <PinOff /> : <Pin />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Rename ${name}`}
            onClick={() => setRenaming(true)}
            className="text-muted-foreground"
          >
            <Pencil />
          </Button>
          <ColourPicker
            name={name}
            colour={pref.colour}
            onPick={(colour) => onChange({ colour })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-4 pb-1">
        <div className="flex flex-wrap gap-1.5">
          {checkout.primary && <Pill tone="highlight">primary</Pill>}
          {pref.pinned && <Pill>pinned</Pill>}
          {checkout.locked && <Pill tone="attention">locked</Pill>}
          {checkout.prunable && <Pill tone="problem">directory gone</Pill>}
        </div>
        {checkout.problem === null ? (
          <GitSummary checkout={checkout} mainline={mainline} />
        ) : (
          <p className="text-sm text-destructive" role="alert">
            {checkout.problem}
          </p>
        )}
        {checkout.services.length > 0 && (
          <ServiceChips services={checkout.services} />
        )}
        <p
          className="truncate font-mono text-xs text-muted-foreground"
          title={checkout.path}
        >
          {checkout.path}
        </p>
      </div>
    </Card>
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
        autoFocus
        aria-label="Name"
        value={value}
        maxLength={60}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone(null)
        }}
        className="h-8"
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

interface ColourPickerProps {
  name: string
  colour: Swatch | undefined
  onPick: (colour: Swatch | undefined) => void
}

function ColourPicker({ name, colour, onPick }: ColourPickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Colour for ${name}`}
            className="text-muted-foreground"
          />
        }
      >
        <Palette />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto">
        <div
          className="grid grid-cols-5 gap-2"
          role="group"
          aria-label="Colour"
        >
          <ColourSwatch
            colour="none"
            label="No colour"
            selected={colour === undefined}
            onClick={() => onPick(undefined)}
          />
          {SWATCHES.map((swatch) => (
            <ColourSwatch
              key={swatch}
              colour={swatch}
              label={swatch}
              selected={colour === swatch}
              onClick={() => onPick(swatch)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
