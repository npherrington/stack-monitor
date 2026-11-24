// `mise run icon`: the pastel beaver, drawn from the letter grid below into the page's icons in
// public/. The grid is the source: edit it here, run the task, and commit what it writes.
import { writeFileSync } from 'node:fs'
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

// The pastel theme's lavender, framed in its accent.
const BACKGROUND = '#f3ecff'
const FRAME = '#c08ae8'

// Measured on a 512 canvas. Each size scales them and rounds to whole pixels.
const CANVAS = 512
const CELL = 20
const FRAME_INSET = 24
const FRAME_WIDTH = 8

const SIZES = { 'icon-512.png': 512, 'apple-touch-icon.png': 180 }

interface Layout {
  size: number
  cell: number
  offset: number // where the grid starts, on both axes
  inset: number
  width: number
}

function layout(size: number): Layout {
  const scale = size / CANVAS
  const cell = Math.max(1, Math.round(CELL * scale))
  return {
    size,
    cell,
    offset: Math.floor((size - cell * BEAVER.length) / 2),
    inset: Math.round(FRAME_INSET * scale),
    width: Math.max(1, Math.round(FRAME_WIDTH * scale)),
  }
}

function colourAt(at: Layout, x: number, y: number): string {
  const { size, cell, offset, inset, width } = at
  const letter =
    BEAVER[Math.floor((y - offset) / cell)]?.[Math.floor((x - offset) / cell)]
  if (x >= offset && y >= offset && letter !== undefined && letter !== '.') {
    return COLOURS[letter]
  }
  const within = (margin: number) =>
    x >= margin && y >= margin && x < size - margin && y < size - margin
  return within(inset) && !within(inset + width) ? FRAME : BACKGROUND
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
function png(size: number): Buffer {
  const at = layout(size)
  const stride = size * 4 + 1
  const pixels = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hex = colourAt(at, x, y)
      const i = y * stride + 1 + x * 4
      pixels.writeUIntBE(Number.parseInt(hex.slice(1), 16), i, 3)
      pixels[i + 3] = 255
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

// The favicon: one path per colour, a square per cell.
function svg(): string {
  const { cell, offset, inset, width } = layout(CANVAS)
  const paths = new Map<string, string>()
  BEAVER.forEach((row, y) => {
    ;[...row].forEach((letter, x) => {
      if (letter === '.') return
      const fill = COLOURS[letter]
      const square = `M${offset + x * cell} ${offset + y * cell}h${cell}v${cell}h-${cell}z`
      paths.set(fill, (paths.get(fill) ?? '') + square)
    })
  })
  const edge = inset + width / 2
  const side = CANVAS - 2 * edge
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" shape-rendering="crispEdges">`,
    `  <rect width="${CANVAS}" height="${CANVAS}" fill="${BACKGROUND}"/>`,
    `  <rect x="${edge}" y="${edge}" width="${side}" height="${side}" fill="none" stroke="${FRAME}" stroke-width="${width}"/>`,
    ...[...paths].map(([fill, d]) => `  <path fill="${fill}" d="${d}"/>`),
    '</svg>',
    '',
  ].join('\n')
}

writeFileSync(join(PUBLIC, 'icon.svg'), svg())
for (const [name, size] of Object.entries(SIZES)) {
  writeFileSync(join(PUBLIC, name), png(size))
}
console.warn(`Wrote icon.svg and ${Object.keys(SIZES).join(', ')} to ${PUBLIC}`)
