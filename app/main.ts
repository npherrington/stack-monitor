// `mise run app`: the monitor as a macOS app. Electron's own Node runs the server in-process (it
// strips types like the node mise pins), and one window shows the page from 127.0.0.1. Closing the
// window keeps the app, its server and the schedules it fires running; Quit ends them.
import { spawn, type ChildProcess } from 'node:child_process'
import { watch } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'

import { launchMonitor } from '../server/launch.ts'
import { decideUpdate, readUpdateState } from './update.ts'

const ROOT = resolve(import.meta.dirname, '..')
const DIST = join(ROOT, 'dist')
const ICON = join(ROOT, 'public', 'icon-dock.png')
const RELOAD_DEBOUNCE_MS = 300
const UPDATE_ITEM = 'update-from-main'

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

// Checked here, so a refusal or "up to date" leaves the app running. The update itself runs in
// scripts/update-app.sh once the app has quit, since npm ci replaces the Electron it runs from.
async function updateFromMain(): Promise<void> {
  const item = Menu.getApplicationMenu()?.getMenuItemById(UPDATE_ITEM)
  if (item) item.enabled = false
  try {
    const decision = decideUpdate(await readUpdateState(ROOT))
    if (decision.kind === 'refuse') {
      await dialog.showMessageBox({
        type: 'warning',
        message: "Stack monitor can't update",
        detail: decision.message,
      })
      return
    }
    if (decision.kind === 'current') {
      await dialog.showMessageBox({
        message: 'Stack monitor is up to date',
        detail: 'main is level with origin/main.',
      })
      return
    }
    const { target, behind, commits } = decision
    const more =
      behind > commits.length ? `\n…and ${behind - commits.length} more` : ''
    // Set by the installed launcher (scripts/install-app.sh), which is what the script reopens.
    const after =
      process.env.STACK_MONITOR_APP === undefined
        ? "An alert says when it's done; start it again with mise run app then, not before."
        : "Then it opens again: don't open it until it does."
    const { response } = await dialog.showMessageBox({
      message: `Update to ${behind} new commit${behind === 1 ? '' : 's'} on main?`,
      detail: `${commits.join('\n')}${more}\n\nStack monitor quits as Quit does, then installs and builds. ${after} If a step fails, an alert says which and where its log is.`,
      buttons: ['Update and Restart', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response !== 0) return
    // The launcher too, so the script doesn't reopen the app while the old one is still exiting.
    const launcher = Number(process.env.STACK_MONITOR_LAUNCHER_PID)
    const pids = [
      process.pid,
      watcher?.pid,
      Number.isInteger(launcher) && launcher > 0 ? launcher : undefined,
    ].filter((pid) => pid !== undefined)
    spawn(
      '/bin/bash',
      [join(ROOT, 'scripts', 'update-app.sh'), target, ...pids.map(String)],
      { cwd: ROOT, detached: true, stdio: 'ignore' },
    ).unref()
    app.quit()
  } finally {
    if (item) item.enabled = true
  }
}

// The default macOS menu, with the app menu written out so the update item can go after About.
function setMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        {
          id: UPDATE_ITEM,
          label: 'Update from main…',
          click: () => void updateFromMain(),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Stack monitor on GitHub',
          click: () =>
            void shell.openExternal(
              'https://github.com/npherrington/stack-monitor',
            ),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function start(): Promise<void> {
  app.dock?.setIcon(nativeImage.createFromPath(ICON))
  setMenu()
  const launched = await launchMonitor(
    { dist: DIST, unbuilt: "The page isn't built. Run mise run build." },
    process.cwd(),
    // A port asked for by name is that port or nothing.
    { fallback: !process.env.STACK_MONITOR_PORT },
  )
  if ('error' in launched) {
    dialog.showErrorBox("The monitor couldn't start", launched.error)
    app.quit()
    return
  }
  // This monitor already serving the port (mise run dev, say) is the one the window shows.
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
