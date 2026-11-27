// The game's name in a 5×5 pixel font, each '1' a pixel.
const GLYPHS = {
  T: ['11111', '..1..', '..1..', '..1..', '..1..'],
  O: ['.111.', '1...1', '1...1', '1...1', '.111.'],
  R: ['1111.', '1...1', '1111.', '1..1.', '1...1'],
  Y: ['1...1', '.1.1.', '..1..', '..1..', '..1..'],
  N: ['1...1', '11..1', '1.1.1', '1..11', '1...1'],
} as const

const SPARKLE = ['.1.', '111', '.1.']

const GLYPH = { width: GLYPHS.T[0].length, height: GLYPHS.T.length }
const PIXEL = 4 // screen pixels to a banner pixel
const GAP = 2 // wide enough that the shadow leaves a gap between letters
const NAME = ['T', 'O', 'R', 'Y', 'N'] as const

interface Pixel {
  x: number
  y: number
}

function pixelsOf(rows: readonly string[], left: number, top: number): Pixel[] {
  return rows.flatMap((row, y) =>
    [...row].flatMap((pixel, x) =>
      pixel === '1' ? [{ x: left + x, y: top + y }] : [],
    ),
  )
}

const NAME_LEFT = SPARKLE[0].length + 2
const LETTERS = NAME.flatMap((letter, at) =>
  pixelsOf(GLYPHS[letter], NAME_LEFT + at * (GLYPH.width + GAP), 0),
)
const NAME_WIDTH = NAME.length * (GLYPH.width + GAP) - GAP
const WIDTH = NAME_LEFT * 2 + NAME_WIDTH
const HEIGHT = GLYPH.height + 1 // the letters and their shadow
const SPARKLES = [
  ...pixelsOf(SPARKLE, 0, 1),
  ...pixelsOf(SPARKLE, WIDTH - SPARKLE[0].length, 1),
]

// One pixel, moved down and right by `shift` for the shadow.
function rect({ x, y }: Pixel, shift = 0) {
  return (
    <rect key={`${x},${y}`} x={x + shift} y={y + shift} width={1} height={1} />
  )
}

// The marquee over the game: its name in pixels with a drop shadow, a sparkle either side.
export function TorynBanner() {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH * PIXEL}
      height={HEIGHT * PIXEL}
      shapeRendering="crispEdges"
      className="mx-auto block max-w-full"
    >
      <g className="fill-game-trim">{LETTERS.map((pixel) => rect(pixel, 1))}</g>
      <g className="fill-game-hull">{LETTERS.map((pixel) => rect(pixel))}</g>
      <g className="fill-game-bullet">{SPARKLES.map((pixel) => rect(pixel))}</g>
    </svg>
  )
}
