// The colours a worktree row or a terminal tab can take: index.css's --color-swatch-* tokens.
export const SWATCHES = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'coral',
  'lime',
  'sky',
  'indigo',
  'sand',
  'slate',
] as const

export type Swatch = (typeof SWATCHES)[number]

export function isSwatch(value: unknown): value is Swatch {
  return SWATCHES.includes(value as Swatch)
}
