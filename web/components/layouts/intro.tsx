import { useEffect, useRef, useState, type RefObject } from 'react'

import { useTheme } from '@/contexts/theme-context.ts'
import { markIntroSeen } from '@/lib/intro.ts'
import { themeIcon } from '@/lib/theme.ts'
import { cn } from '@/lib/utils.ts'

const FLIGHT_MS = 800

interface IntroProps {
  target: RefObject<HTMLImageElement | null> // the sidebar's beaver, where this one lands
  onDone: () => void
}

// The beaver in the middle; a click (or Enter) flies it up into the sidebar's logo while the
// rest fades, and the page is underneath the whole time.
export function Intro({ target, onDone }: IntroProps) {
  const { theme } = useTheme()
  const beaver = useRef<HTMLImageElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const [leaving, setLeaving] = useState(false)

  // The page's only control while it shows, so Enter and Space work at once.
  useEffect(() => button.current?.focus(), [])

  const finish = () => {
    markIntroSeen()
    onDone()
  }

  const leave = () => {
    if (leaving) return
    const from = beaver.current?.getBoundingClientRect()
    const to = target.current?.getBoundingClientRect()
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (still || from === undefined || to === undefined || to.width === 0) {
      finish()
      return
    }
    setLeaving(true)
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    const flight = beaver.current?.animate(
      [
        { transform: 'translate(0, 0) scale(1)' },
        { transform: 'translate(0, 12px) scale(1.06)', offset: 0.15 },
        {
          transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`,
        },
      ],
      {
        duration: FLIGHT_MS,
        easing: 'cubic-bezier(0.6, 0, 0.3, 1)',
        fill: 'forwards',
      },
    )
    void flight?.finished.then(finish, finish)
  }

  return (
    <button
      ref={button}
      type="button"
      onClick={leave}
      aria-label="Open Stack monitor"
      className={cn(
        'fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 outline-none',
        leaving && 'pointer-events-none',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 bg-background transition-opacity duration-700 ease-in',
          leaving && 'opacity-0',
        )}
      >
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--color-secondary)_0%,transparent_60%)]" />
      </span>
      <img
        ref={beaver}
        src={themeIcon(theme)}
        alt=""
        width={192}
        height={192}
        className={cn(
          'relative size-48 rounded-[32px] shadow-xl [image-rendering:pixelated] will-change-transform',
          !leaving && 'animate-intro-float',
        )}
      />
      <span
        className={cn(
          'relative flex flex-col items-center gap-2 transition duration-300',
          leaving && 'translate-y-3 opacity-0',
        )}
      >
        <span className="bg-linear-to-r from-strong to-muted-foreground bg-clip-text text-4xl font-extrabold text-transparent">
          Stack monitor
        </span>
        <span className="text-sm font-semibold text-muted-foreground">
          Click or press Enter
        </span>
      </span>
    </button>
  )
}
