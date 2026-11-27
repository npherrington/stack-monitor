import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'

import { useTheme } from '@/contexts/theme-context.ts'
import {
  START_LIVES,
  newGame,
  step,
  type Input,
  type Phase,
  type TorynState,
} from '@/lib/toryn.ts'
import { draw, readPalette, type Palette } from '@/lib/toryn-draw.ts'

const HIGH_SCORE_KEY = 'stack-monitor:toryn-high-score'

// By `code`, so WASD sits under the same fingers on any layout.
const MOVES: Partial<Record<string, keyof Input>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

const MAX_STEP = 0.05 // seconds: a slow frame moves the game on no more than this

function readHighScore(): number {
  try {
    const stored = Number(localStorage.getItem(HIGH_SCORE_KEY))
    return Number.isSafeInteger(stored) && stored > 0 ? stored : 0
  } catch {
    return 0
  }
}

// Against what's stored now, not what this page read at load, so a second tab's better score
// stays. Gives back the best of the two.
function recordScore(score: number): number {
  const best = Math.max(readHighScore(), score)
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(best))
  } catch {
    // A convenience: without storage the high score lasts as long as the page.
  }
  return best
}

const mathSeed = () => Math.floor(Math.random() * 2 ** 32)
const noKeys = (): Input => ({
  up: false,
  down: false,
  left: false,
  right: false,
})

interface Hud {
  phase: Phase
  score: number
  lives: number
  wave: number
}

const hudOf = ({ phase, score, lives, wave }: TorynState): Hud => ({
  phase,
  score,
  lives,
  wave,
})

const sameHud = (a: Hud, b: Hud) =>
  a.phase === b.phase &&
  a.score === b.score &&
  a.lives === b.lives &&
  a.wave === b.wave

interface UseTorynStateResult extends Hud {
  canvasRef: RefObject<HTMLCanvasElement | null>
  highScore: number
  start: () => void
  resume: () => void
  onKeyDown: (event: KeyboardEvent) => void
  onKeyUp: (event: KeyboardEvent) => void
  onBlur: () => void
}

// Toryn, the sidebar game: keys count only while its canvas has focus, and losing focus (another
// control, another window, a hidden tab) pauses it until Resume or a key. Frames run only while
// it's being played and for the last explosion after it ends.
export function useTorynState(
  randomSeed: () => number = mathSeed,
): UseTorynStateResult {
  const { theme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<TorynState | null>(null)
  const keysRef = useRef<Input>(noKeys())
  const paletteRef = useRef<Palette | null>(null)
  const paletteThemeRef = useRef<string | null>(null) // the variety paletteRef was read under
  const [hud, setHud] = useState<Hud>({
    phase: 'ready',
    score: 0,
    lives: START_LIVES,
    wave: 1,
  })
  const [highScore, setHighScore] = useState(readHighScore)

  const game = useCallback(() => {
    if (gameRef.current === null) gameRef.current = newGame(randomSeed())
    return gameRef.current
  }, [randomSeed])

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx === null || ctx === undefined) return
    paletteRef.current ??= readPalette(document)
    draw(ctx, game(), paletteRef.current)
  }, [game])

  const sync = useCallback(() => {
    const next = hudOf(game())
    setHud((current) => (sameHud(current, next) ? current : next))
  }, [game])

  // Another tab's game over.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === HIGH_SCORE_KEY) setHighScore(readHighScore())
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // A game cut short, by collapsing the sidebar say, still counts.
  useEffect(
    () => () => {
      const state = gameRef.current
      if (state !== null && state.phase !== 'over') recordScore(state.score)
    },
    [],
  )

  // One frame after a theme change, once ThemeProvider has set the new variety on <html>.
  useEffect(() => {
    if (paletteThemeRef.current === theme) return
    const frame = requestAnimationFrame(() => {
      paletteRef.current = readPalette(document)
      paletteThemeRef.current = theme
      paint()
    })
    return () => cancelAnimationFrame(frame)
  }, [theme, paint])

  const { phase } = hud
  useEffect(() => {
    if (phase !== 'playing' && phase !== 'over') return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const state = game()
      const wasOver = state.phase === 'over'
      // A frame's timestamp can come before the performance.now() the loop started at.
      const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_STEP)
      step(state, keysRef.current, dt)
      last = now
      paint()
      sync()
      if (state.phase === 'over') {
        if (!wasOver) setHighScore(recordScore(state.score))
        if (state.sparks.length === 0) return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, game, paint, sync])

  const start = useCallback(() => {
    const state = newGame(randomSeed())
    state.phase = 'playing'
    gameRef.current = state
    keysRef.current = noKeys()
    canvasRef.current?.focus()
    sync()
  }, [randomSeed, sync])

  const carryOn = useCallback(() => {
    const state = game()
    if (state.phase !== 'paused') return
    state.phase = 'playing'
    sync()
  }, [game, sync])

  const resume = useCallback(() => {
    canvasRef.current?.focus()
    carryOn()
  }, [carryOn])

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // macOS sends no keyup for a key let go while ⌘ is held, so a chord lets go of them all.
      if (event.metaKey || event.ctrlKey || event.altKey) {
        keysRef.current = noKeys()
        return
      }
      const move = MOVES[event.code]
      if (move !== undefined) {
        event.preventDefault()
        keysRef.current[move] = true
        carryOn()
        return
      }
      if (event.key === 'Escape') {
        canvasRef.current?.blur()
        return
      }
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      const current = game().phase
      if (current === 'paused') carryOn()
      else if (current !== 'playing') start()
    },
    [game, start, carryOn],
  )

  const onKeyUp = useCallback((event: KeyboardEvent) => {
    const move = MOVES[event.code]
    if (move !== undefined) keysRef.current[move] = false
  }, [])

  const onBlur = useCallback(() => {
    keysRef.current = noKeys()
    const state = game()
    if (state.phase !== 'playing') return
    state.phase = 'paused'
    sync()
  }, [game, sync])

  return useMemo(
    () => ({
      ...hud,
      canvasRef,
      highScore,
      start,
      resume,
      onKeyDown,
      onKeyUp,
      onBlur,
    }),
    [hud, highScore, start, resume, onKeyDown, onKeyUp, onBlur],
  )
}
