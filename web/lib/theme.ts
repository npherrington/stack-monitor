// The pastel varieties. Each id is a token block in web/index.css (:root[data-theme='<id>']), and
// public/theme.js reads the same storage key to set it before the bundle loads.
export const THEMES = [
  {
    id: 'blossom',
    label: 'Blossom',
    colours: 'pink · lavender · mint',
    preview: ['#f5b2d0', '#c08ae8', '#a8ddb5'],
    mode: 'light',
  },
  {
    id: 'peach',
    label: 'Peach',
    colours: 'apricot · cream · coral',
    preview: ['#f8c08f', '#f4a582', '#f4a3a8'],
    mode: 'light',
  },
  {
    id: 'mint',
    label: 'Mint',
    colours: 'mint · sage · aqua',
    preview: ['#a8ddb5', '#7fcfae', '#96d8cf'],
    mode: 'light',
  },
  {
    id: 'lavender',
    label: 'Lavender',
    colours: 'lilac · periwinkle · rose',
    preview: ['#c9b2f0', '#a99cf0', '#f5b2d0'],
    mode: 'light',
  },
  {
    id: 'sky',
    label: 'Sky',
    colours: 'baby blue · aqua · lilac',
    preview: ['#a3c4f3', '#8cbcf0', '#96d8cf'],
    mode: 'light',
  },
  {
    id: 'lemon',
    label: 'Lemon',
    colours: 'butter · peach · mint',
    preview: ['#f2dc7d', '#f8c08f', '#a8ddb5'],
    mode: 'light',
  },
  {
    id: 'rose',
    label: 'Rose',
    colours: 'rose · blush · apricot',
    preview: ['#f5b2d0', '#f29bb8', '#f8c08f'],
    mode: 'light',
  },
  {
    id: 'sage',
    label: 'Sage',
    colours: 'sage · olive · cream',
    preview: ['#c6d8b8', '#a9c49a', '#f2eedf'],
    mode: 'light',
  },
  {
    id: 'seafoam',
    label: 'Seafoam',
    colours: 'seafoam · aqua · sky',
    preview: ['#96d8cf', '#86d5cc', '#a3c4f3'],
    mode: 'light',
  },
  {
    id: 'coral',
    label: 'Coral',
    colours: 'coral · peach · butter',
    preview: ['#f6a07e', '#f8c08f', '#f2dc7d'],
    mode: 'light',
  },
  {
    id: 'sand',
    label: 'Sand',
    colours: 'sand · oat · clay',
    preview: ['#e3cfae', '#dcc19a', '#f4a3a8'],
    mode: 'light',
  },
  {
    id: 'cloud',
    label: 'Cloud',
    colours: 'silver · slate · lilac',
    preview: ['#d5dbe6', '#a9b8d0', '#c9b2f0'],
    mode: 'light',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    colours: 'navy · lilac · periwinkle',
    preview: ['#141826', '#a99cf0', '#a3c4f3'],
    mode: 'dark',
  },
  {
    id: 'dusk',
    label: 'Dusk',
    colours: 'plum · pink · lilac',
    preview: ['#1c1520', '#e59ac8', '#c9b2f0'],
    mode: 'dark',
  },
  {
    id: 'forest',
    label: 'Forest',
    colours: 'pine · mint · sage',
    preview: ['#121a17', '#7fcfae', '#c6d8b8'],
    mode: 'dark',
  },
  {
    id: 'mocha',
    label: 'Mocha',
    colours: 'coffee · peach · butter',
    preview: ['#1d1714', '#f4a582', '#f2dc7d'],
    mode: 'dark',
  },
  {
    id: 'ink',
    label: 'Ink',
    colours: 'ink · pink · lavender',
    preview: ['#121214', '#f5b2d0', '#c9b2f0'],
    mode: 'dark',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    colours: 'deep teal · aqua · sky',
    preview: ['#0f1a1e', '#7fd3d8', '#a3c4f3'],
    mode: 'dark',
  },
] as const

export type Theme = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: Theme = 'blossom'
const STORAGE_KEY = 'stack-monitor-theme'

function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme.id === value)
}

// Storage can throw (blocked site data); the page then starts on the default.
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // The choice lasts until the page reloads.
  }
}

export const THEME_STORAGE_KEY = STORAGE_KEY

// The variety's beaver, drawn by `mise run icon`. Relative, like every asset (vite.config.ts base).
export function themeIcon(theme: Theme): string {
  return `./icons/${theme}.svg`
}

export function themeMode(theme: Theme): 'light' | 'dark' {
  return THEMES.find((option) => option.id === theme)?.mode ?? 'light'
}

// index.css reads the variety from <html data-theme>, and a dark one's mode from data-mode; the
// tab shows its beaver.
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.mode = themeMode(theme)
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon !== null) icon.href = themeIcon(theme)
}
