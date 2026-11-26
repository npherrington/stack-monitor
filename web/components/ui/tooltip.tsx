import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils.ts'

function TooltipProvider({
  delay = 300,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />
}

interface TipProps {
  label: ReactNode // what the icon means, in words
  children: ReactElement // the trigger: an icon, a button
  side?: TooltipPrimitive.Positioner.Props['side']
  className?: string
}

// Words for an icon on hover and focus. The trigger is rendered as-is, so a button stays a button.
function Tip({ label, children, side = 'top', className }: TipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          sideOffset={6}
          className="isolate z-50"
        >
          <TooltipPrimitive.Popup
            className={cn(
              'z-50 max-w-64 origin-(--transform-origin) rounded-md bg-strong px-2 py-1 text-xs text-background shadow-md duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0',
              className,
            )}
          >
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tip, TooltipProvider }
