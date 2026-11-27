// Drawing Toryn onto its canvas, a pixel to a field pixel; CSS scales it up unsmoothed.
import {
  BULLET_SIZE,
  FIELD,
  SHIP_SIZE,
  SHOT_SIZE,
  type EnemyKind,
  type TorynState,
} from './toryn.ts'

const PALETTE_KEYS = [
  'space',
  'star',
  'star-dim',
  'hull',
  'trim',
  'cockpit',
  'flame',
  'bullet',
  'shot',
  'dart',
  'saucer',
  'brute',
  'eye',
] as const
type PaletteKey = (typeof PALETTE_KEYS)[number]
export type Palette = Record<PaletteKey, string>

// The --game-* tokens in web/index.css, as the active variety resolves them. A custom property
// reads back as written, color-mix() and all, so each is resolved through a probe's color.
export function readPalette(doc: Document): Palette {
  const probe = doc.createElement('span')
  probe.style.display = 'none'
  doc.body.append(probe)
  const palette = {} as Palette
  for (const key of PALETTE_KEYS) {
    probe.style.color = `var(--game-${key})`
    palette[key] = getComputedStyle(probe).color
  }
  probe.remove()
  return palette
}

// Each character is a pixel: '.' is empty, a digit picks a colour from the sprite's own list.
type Sprite = readonly string[]

const SHIP: Sprite = [
  '...1...',
  '..131..',
  '..131..',
  '.12221.',
  '1111111',
  '11.1.11',
  '1.....1',
]
const FLAME: readonly Sprite[] = [
  ['.4...4.', '.......'],
  ['.4...4.', '.4...4.'],
]

const SPRITES: Record<EnemyKind, readonly Sprite[]> = {
  dart: [
    ['1.....1', '11.2.11', '.11111.', '..111..', '...1...'],
    ['1.....1', '.1.2.1.', '.11111.', '..111..', '...1...'],
  ],
  saucer: [
    ['..1111..', '.122221.', '11111111', '.1.1.1..', '........'],
    ['..1111..', '.122221.', '11111111', '..1.1.1.', '........'],
  ],
  brute: [
    [
      '1...1...1',
      '11.111.11',
      '111111111',
      '1122.2211',
      '.1111111.',
      '..1.1.1..',
      '.1.....1.',
    ],
    [
      '1...1...1',
      '11.111.11',
      '111111111',
      '1122.2211',
      '.1111111.',
      '.1..1..1.',
      '1.......1',
    ],
  ],
}

function blit(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  colours: readonly string[],
): void {
  const left = Math.round(x)
  const top = Math.round(y)
  sprite.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const pixel = row[dx]
      if (pixel === '.') continue
      ctx.fillStyle = colours[Number(pixel) - 1]
      ctx.fillRect(left + dx, top + dy, 1, 1)
    }
  })
}

export function draw(
  ctx: CanvasRenderingContext2D,
  state: TorynState,
  palette: Palette,
): void {
  ctx.fillStyle = palette.space
  ctx.fillRect(0, 0, FIELD.width, FIELD.height)

  for (const star of state.stars) {
    ctx.fillStyle = star.layer === 2 ? palette.star : palette['star-dim']
    ctx.fillRect(star.x, Math.floor(star.y), 1, star.layer === 2 ? 2 : 1)
  }

  // Two frames a sprite, swapped about five times a second.
  const frame = Math.floor(state.time * 5) % 2

  for (const enemy of state.enemies) {
    const sprite = SPRITES[enemy.kind][frame]
    const body = enemy.flash > 0 ? palette.star : palette[enemy.kind]
    blit(ctx, sprite, enemy.x, enemy.y, [body, palette.eye])
  }

  ctx.fillStyle = palette.bullet
  for (const bullet of state.bullets)
    ctx.fillRect(
      Math.round(bullet.x),
      Math.round(bullet.y),
      BULLET_SIZE.width,
      BULLET_SIZE.height,
    )

  ctx.fillStyle = palette.shot
  for (const shot of state.shots)
    ctx.fillRect(
      Math.round(shot.x),
      Math.round(shot.y),
      SHOT_SIZE.width,
      SHOT_SIZE.height,
    )

  const blinking = state.grace > 0 && Math.floor(state.grace * 10) % 2 === 0
  if (state.phase !== 'over' && !blinking) {
    const colours = [palette.hull, palette.trim, palette.cockpit, palette.flame]
    blit(ctx, SHIP, state.ship.x, state.ship.y, colours)
    blit(
      ctx,
      FLAME[frame],
      state.ship.x,
      state.ship.y + SHIP_SIZE.height,
      colours,
    )
  }

  for (const spark of state.sparks) {
    if (spark.age < 0) continue
    ctx.fillStyle = spark.age < 0.15 ? palette.star : palette.bullet
    if (spark.age > 0.3) ctx.fillStyle = palette.flame
    ctx.fillRect(
      Math.round(spark.x),
      Math.round(spark.y),
      spark.size,
      spark.size,
    )
  }
}

// The enemy sizes the sprites must match; tests/toryn.test.ts checks them against ENEMIES.
export function spriteSize(kind: EnemyKind): { width: number; height: number } {
  const sprite = SPRITES[kind][0]
  return { width: sprite[0].length, height: sprite.length }
}
