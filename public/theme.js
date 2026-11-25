// Sets the saved pastel variety on <html>, and its beaver as the tab icon, before the page's bundle
// loads, so the first paint is already in it. A file rather than an inline script: the CSP allows
// only the page's own files. The key, ids and icon paths are web/lib/theme.ts's.
try {
  var theme = localStorage.getItem('stack-monitor-theme')
  if (/^(blossom|peach|mint|lavender|sky|lemon)$/.test(theme || '')) {
    document.documentElement.dataset.theme = theme
    var icon = document.querySelector('link[rel="icon"]')
    if (icon) icon.href = './icons/' + theme + '.svg'
  }
} catch {
  // Blocked site data: the default variety applies.
}
