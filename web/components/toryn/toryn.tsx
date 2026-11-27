import { TorynBanner } from '@/components/toryn/toryn-banner.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useTorynState } from '@/hooks/use-toryn-state.ts'
import { FIELD, type Phase } from '@/lib/toryn.ts'

const OVERLAY: Record<
  Exclude<Phase, 'playing'>,
  { note: string; action: string }
> = {
  ready: { note: 'Arrows or WASD to fly', action: 'Play' },
  paused: { note: 'Paused', action: 'Resume' },
  over: { note: 'Game over', action: 'Play again' },
}

// Toryn, a small shoot-'em-up at the foot of the sidebar, in the theme's colours. The ship fires by
// itself; the keys move it while the game has focus.
export function Toryn() {
  const {
    canvasRef,
    phase,
    score,
    lives,
    wave,
    highScore,
    start,
    resume,
    onKeyDown,
    onKeyUp,
    onBlur,
  } = useTorynState()
  const overlay = phase === 'playing' ? null : OVERLAY[phase]
  const note =
    overlay === null
      ? ''
      : phase === 'over'
        ? `${overlay.note} · ${score}`
        : overlay.note
  return (
    <section aria-label="Toryn" className="flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-md border bg-game-space">
        <div className="border-b px-2 py-1.5">
          <TorynBanner />
        </div>
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={FIELD.width}
            height={FIELD.height}
            tabIndex={0}
            aria-label="The game. Move with the arrow keys or WASD; the ship fires by itself. Escape pauses."
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onBlur={() => onBlur()}
            className="block h-auto w-full outline-none [image-rendering:pixelated] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
          {overlay !== null && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-game-space/55">
              <p
                aria-hidden="true"
                className="font-mono text-[11px] font-semibold tracking-wider text-game-star uppercase"
              >
                {note}
              </p>
              <Button
                size="xs"
                onClick={() => (phase === 'paused' ? resume() : start())}
              >
                {overlay.action}
              </Button>
            </div>
          )}
        </div>
      </div>
      <p role="status" className="sr-only">
        {note}
      </p>
      <p className="flex justify-between px-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>
          {score}
          {phase !== 'ready' && (
            <>
              {` · W${wave} · `}
              <span aria-hidden="true">{'♥'.repeat(Math.max(lives, 0))}</span>
              <span className="sr-only">{`${lives} lives left`}</span>
            </>
          )}
        </span>
        <span>HI {highScore}</span>
      </p>
    </section>
  )
}
