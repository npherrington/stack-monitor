import { cva } from 'class-variance-authority'

// Its own file so a card can take a swatch's edge colour: a component file may only export
// components. The colours are index.css's --color-swatch-* tokens.
export const swatchFill = cva('', {
  variants: {
    colour: {
      red: 'bg-swatch-red',
      orange: 'bg-swatch-orange',
      yellow: 'bg-swatch-yellow',
      green: 'bg-swatch-green',
      teal: 'bg-swatch-teal',
      blue: 'bg-swatch-blue',
      purple: 'bg-swatch-purple',
      pink: 'bg-swatch-pink',
      coral: 'bg-swatch-coral',
      lime: 'bg-swatch-lime',
      sky: 'bg-swatch-sky',
      indigo: 'bg-swatch-indigo',
      sand: 'bg-swatch-sand',
      slate: 'bg-swatch-slate',
      none: 'bg-muted',
    },
  },
  defaultVariants: { colour: 'none' },
})

// A whole row in its checkout's colour: the swatch washed out enough for text to sit on it.
export const swatchTint = cva('', {
  variants: {
    colour: {
      red: 'bg-swatch-red/40 hover:bg-swatch-red/55',
      orange: 'bg-swatch-orange/40 hover:bg-swatch-orange/55',
      yellow: 'bg-swatch-yellow/40 hover:bg-swatch-yellow/55',
      green: 'bg-swatch-green/40 hover:bg-swatch-green/55',
      teal: 'bg-swatch-teal/40 hover:bg-swatch-teal/55',
      blue: 'bg-swatch-blue/40 hover:bg-swatch-blue/55',
      purple: 'bg-swatch-purple/40 hover:bg-swatch-purple/55',
      pink: 'bg-swatch-pink/40 hover:bg-swatch-pink/55',
      coral: 'bg-swatch-coral/40 hover:bg-swatch-coral/55',
      lime: 'bg-swatch-lime/40 hover:bg-swatch-lime/55',
      sky: 'bg-swatch-sky/40 hover:bg-swatch-sky/55',
      indigo: 'bg-swatch-indigo/40 hover:bg-swatch-indigo/55',
      sand: 'bg-swatch-sand/40 hover:bg-swatch-sand/55',
      slate: 'bg-swatch-slate/40 hover:bg-swatch-slate/55',
      none: 'hover:bg-muted/50',
    },
  },
  defaultVariants: { colour: 'none' },
})
