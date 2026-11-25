// `mise run app`: the monitor as a macOS app. Electron's own Node runs the server in-process (it
// strips types like the node mise pins), and one window shows the page from 127.0.0.1. Closing the
// window keeps the app, its server and the schedules it fires running; Quit ends them.
import { spawn, type ChildProcess } from 'node:child_process'
import { watch } from 'node:fs'
import { join, resolve } from 'node:path'

import { app, BrowserWindow, dialog, nativeImage, shell } from 'electron'

import { launchMonitor } from '../server/launch.ts'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'dist')
const ICON = join(ROOT, 'public', 'icon-512.png')
const RELOAD_DEBOUNCE_MS = 300

let url = ''
let window: BrowserWindow | null = null
let watcher: ChildProcess | null = null

function openWindow(): void {
  if (window !== null) {
    window.show()
    window.focus()
    return
  }
  window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    title: 'Stack monitor',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const { webContents } = window
  // The page links out to PRs and docs: those open in the browser, never in this window.
  webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target)) void shell.openExternal(target)
    return { action: 'deny' }
  })
  webContents.on('will-navigate', (event, target) => {
    if (target.startsWith(url)) return
    event.preventDefault()
    if (/^https?:\/\//.test(target)) void shell.openExternal(target)
  })
  window.once('ready-to-show', () => window?.show())
  window.on('closed', () => {
    window = null
  })
  void window.loadURL(url)
}

// In development the page rebuilds on save and the window reloads when dist/ changes. Server
// code (core/, server/) is read once: restart the app for a change there.
function watchPage(): void {
  watcher = spawn(
    join(ROOT, 'node_modules', '.bin', 'vite'),
    ['build', '--watch'],
    {
      cwd: ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )
  let timer: NodeJS.Timeout | undefined
  watch(DIST, () => {
    clearTimeout(timer)
    timer = setTimeout(() => window?.webContents.reload(), RELOAD_DEBOUNCE_MS)
  })
}

async function start(): Promise<void> {
  app.dock?.setIcon(nativeImage.createFromPath(ICON))
  const launched = await launchMonitor(
    { dist: DIST, unbuilt: "The page isn't built. Run mise run build." },
    process.cwd(),
  )
  if ('error' in launched) {
    dialog.showErrorBox("The monitor couldn't start", launched.error)
    app.quit()
    return
  }
  // A monitor already serving the port (mise run dev, say) is the one this window shows.
  url = launched.url
  if (!app.isPackaged) watchPage()
  openWindow()
}

app.setName('Stack monitor')
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', openWindow)
  app.on('activate', () => {
    if (url !== '') openWindow()
  })
  app.on('window-all-closed', () => {
    // macOS keeps the app in the Dock with its server running, so monitor-fired schedules fire.
  })
  app.on('will-quit', () => watcher?.kill())
  void app.whenReady().then(start)
}
