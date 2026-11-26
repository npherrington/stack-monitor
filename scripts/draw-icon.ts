// `mise run icon`: the pastel beaver, drawn from the letter grid below into the page's icons in
// public/: one favicon per pastel variety, which the page swaps with the theme, the PNGs the
// manifest takes, and the app's Dock icon, in Blossom. The grid is the source: edit it here, run the task, and
// commit what it writes.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

const PUBLIC = join(import.meta.dirname, '..', 'public')

// 16 by 16, a letter a colour. '.' shows the background.
const BEAVER = [
  '................',
  '................',
  '..ooo......ooo..',
  '.oeefoooooofeeo.',
  '.oeffffffffffeo.',
  'offffffffffffffo',
  'offwpffffffwpffo',
  'offppffffffppffo',
  'ocffmmnnnnmmffco',
  'offmmmmnnmmmmffo',
  '.ofmmmmoommmmfo.',
  '.ofmmotTtTommfo.',
  '..ooootTtToooo..',
  '.....otTtTo.....',
  '......oooo......',
  '................',
]

const COLOURS: Record<string, string> = {
  o: '#4a3530', // outline
  e: '#f6a9c0', // inner ear
  f: '#c99b78', // fur
  w: '#ffffff', // eye shine
  p: '#2d2438', // pupil
  c: '#f2a3b3', // cheek
  m: '#f6dcc4', // muzzle
  n: '#6e4a52', // nose
  t: '#ffd6a3', // tooth
  T: '#f2aa6e', // tooth shadow
}

// Each variety's soft tint: web/index.css's --secondary. The ids are web/lib/theme.ts's THEMES.
const VARIETIES: Record<string, string> = {
  blossom: '#f3ecff',
  peach: '#ffeee2',
  mint: '#e3f6ec',
  lavender: '#eeeaff',
  sky: '#e6f1ff',
  lemon: '#fff7d6',
  rose: '#ffe9f0',
  sage: '#e9efe3',
  seafoam: '#ddf3f0',
  coral: '#ffe8df',
  sand: '#f3ecdf',
  cloud: '#eceff4',
  midnight: '#232a40',
  dusk: '#2f2336',
  forest: '#1f2d27',
  mocha: '#30261f',
  ink: '#232328',
  ocean: '#1b2e34',
}

// The PNGs are fixed once the Dock or a manifest has them, so they're the default variety.
const DEFAULT = VARIETIES.blossom

// Measured on a 512 canvas. Each size scales it and rounds to whole pixels.
const CANVAS = 512
const CELL = 20

// Square and edge to edge: a browser or iOS rounds these itself.
const SIZES = { 'icon-512.png': 512, 'apple-touch-icon.png': 180 }

// The Dock shows an image as it is, so this one is drawn in a Mac app icon's shape: on Apple's
// 1024 grid, an 824 squircle in the middle, the beaver about seven tenths of it.
const DOCK = { file: 'icon-dock.png', size: 1024, shape: 824, cell: 36 }
const SQUIRCLE_POWER = 5 // a superellipse this round is close to Apple's continuous corners
const SAMPLES = 4 // per side of a pixel, for the squircle's soft edge

interface Layout {
  size: number
  cell: number
  offset: number // where the grid starts, on both axes
}

function layout(
  size: number,
  cell = Math.max(1, Math.round(CELL * (size / CANVAS))),
): Layout {
  return { size, cell, offset: Math.floor((size - cell * BEAVER.length) / 2) }
}

// The beaver's colour at a pixel, or the background's.
function colourAt({ cell, offset }: Layout, x: number, y: number): string {
  const letter =
    BEAVER[Math.floor((y - offset) / cell)]?.[Math.floor((x - offset) / cell)]
  if (x >= offset && y >= offset && letter !== undefined && letter !== '.') {
    return COLOURS[letter]
  }
  return DEFAULT
}

// How much of a pixel the Dock icon's squircle covers, 0 to 1.
function squircleCover(x: number, y: number): number {
  const half = DOCK.shape / 2
  const centre = DOCK.size / 2
  let inside = 0
  for (let i = 0; i < SAMPLES; i += 1) {
    for (let j = 0; j < SAMPLES; j += 1) {
      const u = Math.abs(x + (i + 0.5) / SAMPLES - centre) / half
      const v = Math.abs(y + (j + 0.5) / SAMPLES - centre) / half
      if (u ** SQUIRCLE_POWER + v ** SQUIRCLE_POWER <= 1) inside += 1
    }
  }
  return inside / SAMPLES ** 2
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// Length, type, data, then a CRC of type and data.
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

// An 8-bit RGBA PNG. Each row starts with filter byte 0 (none), which Buffer.alloc's zeros give.
function png(
  at: Layout,
  cover: (x: number, y: number) => number = () => 1,
): Buffer {
  const { size } = at
  const stride = size * 4 + 1
  const pixels = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hex = colourAt(at, x, y)
      const i = y * stride + 1 + x * 4
      pixels.writeUIntBE(Number.parseInt(hex.slice(1), 16), i, 3)
      pixels[i + 3] = Math.round(cover(x, y) * 255)
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bits per channel
  header[9] = 6 // RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// A favicon: one path per colour, a square per cell.
function svg(background: string): string {
  const { cell, offset } = layout(CANVAS)
  const paths = new Map<string, string>()
  BEAVER.forEach((row, y) => {
    ;[...row].forEach((letter, x) => {
      if (letter === '.') return
      const fill = COLOURS[letter]
      const square = `M${offset + x * cell} ${offset + y * cell}h${cell}v${cell}h-${cell}z`
      paths.set(fill, (paths.get(fill) ?? '') + square)
    })
  })
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" shape-rendering="crispEdges">`,
    `  <rect width="${CANVAS}" height="${CANVAS}" fill="${background}"/>`,
    ...[...paths].map(([fill, d]) => `  <path fill="${fill}" d="${d}"/>`),
    '</svg>',
    '',
  ].join('\n')
}

writeFileSync(join(PUBLIC, 'icon.svg'), svg(DEFAULT))
mkdirSync(join(PUBLIC, 'icons'), { recursive: true })
for (const [id, background] of Object.entries(VARIETIES)) {
  writeFileSync(join(PUBLIC, 'icons', `${id}.svg`), svg(background))
}
for (const [name, size] of Object.entries(SIZES)) {
  writeFileSync(join(PUBLIC, name), png(layout(size)))
}
writeFileSync(
  join(PUBLIC, DOCK.file),
  png(layout(DOCK.size, DOCK.cell), squircleCover),
)
console.warn(
  `Wrote icon.svg, icons/{${Object.keys(VARIETIES).join(',')}}.svg, ${Object.keys(SIZES).join(', ')} and ${DOCK.file} to ${PUBLIC}`,
)
