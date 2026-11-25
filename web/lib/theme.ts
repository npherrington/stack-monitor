// The pastel varieties. Each id is a token block in web/index.css (:root[data-theme='<id>']), and
// public/theme.js reads the same storage key to set it before the bundle loads.
export const THEMES = [
  {
    id: 'blossom',
    label: 'Blossom',
    colours: 'pink · lavender · mint',
    preview: ['#f5b2d0', '#c08ae8', '#a8ddb5'],
  },
  {
    id: 'peach',
    label: 'Peach',
    colours: 'apricot · cream · coral',
    preview: ['#f8c08f', '#f4a582', '#f4a3a8'],
  },
  {
    id: 'mint',
    label: 'Mint',
    colours: 'mint · sage · aqua',
    preview: ['#a8ddb5', '#7fcfae', '#96d8cf'],
  },
  {
    id: 'lavender',
    label: 'Lavender',
    colours: 'lilac · periwinkle · rose',
    preview: ['#c9b2f0', '#a99cf0', '#f5b2d0'],
  },
  {
    id: 'sky',
    label: 'Sky',
    colours: 'baby blue · aqua · lilac',
    preview: ['#a3c4f3', '#8cbcf0', '#96d8cf'],
  },
  {
    id: 'lemon',
    label: 'Lemon',
    colours: 'butter · peach · mint',
    preview: ['#f2dc7d', '#f8c08f', '#a8ddb5'],
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

// index.css reads the variety from <html data-theme>, and the tab shows its beaver.
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon !== null) icon.href = themeIcon(theme)
}
