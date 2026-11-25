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
      none: 'bg-muted',
    },
  },
  defaultVariants: { colour: 'none' },
})
