import type { ITheme } from '@xterm/xterm'

// The terminal in the app's theme. Swatches are pastel, made dark enough to read as text.
const TEXT = (swatch: string) =>
  `color-mix(in oklab, var(--color-swatch-${swatch}) 45%, var(--strong))`

type Colour = Exclude<keyof ITheme, 'extendedAnsi'>

const COLOURS: Partial<Record<Colour, string>> = {
  background: 'var(--card)',
  foreground: 'var(--foreground)',
  cursor: 'var(--primary)',
  cursorAccent: 'var(--card)',
  selectionBackground: 'color-mix(in srgb, var(--primary) 30%, transparent)',
  black: 'var(--strong)',
  red: 'var(--destructive)',
  green: 'var(--success)',
  yellow: 'var(--warning)',
  blue: TEXT('blue'),
  magenta: TEXT('purple'),
  cyan: TEXT('teal'),
  // Claude Code's light-ansi theme fills its message bars and draws the prompt's border in these.
  white: 'var(--border)',
  brightBlack: 'var(--muted-foreground)',
  brightRed: TEXT('red'),
  brightGreen: TEXT('green'),
  brightYellow: TEXT('orange'),
  brightBlue: TEXT('blue'),
  brightMagenta: TEXT('pink'),
  brightCyan: TEXT('teal'),
  brightWhite: 'var(--muted)',
}

// xterm reads only plain colours, and a computed var() or color-mix() can come back as oklab()
// or color(srgb …), so each is painted on a pixel and read back.
export function readTerminalTheme(): ITheme {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  document.body.append(probe)
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const paint = canvas.getContext('2d', { willReadFrequently: true })
  const theme: Partial<Record<Colour, string>> = {}
  for (const [key, value] of Object.entries(COLOURS)) {
    probe.style.color = value
    const computed = getComputedStyle(probe).color
    if (paint === null) {
      theme[key as Colour] = computed
      continue
    }
    paint.clearRect(0, 0, 1, 1)
    paint.fillStyle = computed
    paint.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data
    theme[key as Colour] = `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(2)})`
  }
  probe.remove()
  return theme
}
