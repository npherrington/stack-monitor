import { swatchFill } from '@/components/ui/swatch-variants.ts'
import { SWATCHES, type Swatch } from '@/lib/swatches.ts'
import { cn } from '@/lib/utils.ts'

interface SwatchPickerProps {
  label: string // read out for the group: "Colour"
  value: Swatch | null
  onChange: (value: Swatch | null) => void
}

// The swatches, plus none, as a row of choices for a form. ColourMenu is the same choice in a menu.
function SwatchPicker({ label, value, onChange }: SwatchPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-1.5"
    >
      {(['none', ...SWATCHES] as const).map((swatch) => {
        const name = swatch === 'none' ? 'No colour' : swatch
        return (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={(value ?? 'none') === swatch}
            aria-label={name}
            title={name}
            onClick={() => onChange(swatch === 'none' ? null : swatch)}
            className={cn(
              swatchFill({ colour: swatch }),
              'size-6 rounded-full ring-offset-2 ring-offset-popover outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:ring-2 aria-checked:ring-strong',
              swatch === 'none' && 'border border-dashed border-border',
            )}
          />
        )
      })}
    </div>
  )
}

export { SwatchPicker }
