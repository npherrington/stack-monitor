# The desktop app is Electron, running the server in-process; shipped outside the App Store

**Status:** Accepted — 2026-11

## Context

The monitor is a local server and a page. People want it as a Mac app: its own window and Dock
icon, started without a terminal. PLAN.md step 7 plans an Electron shell that starts the server
with `startMonitor` and loads the page from `http://127.0.0.1:<port>`, so the server's Host and
Origin checks hold unchanged. The server runs `.ts` through Node's type stripping; Electron 45
ships Node 24.22, which strips types too, so the main process can import `server/` as it is.

The monitor runs `git`, `ps`, `lsof`, agent CLIs and `launchctl` against repos anywhere on disk,
and schedules install LaunchAgents in `~/Library/LaunchAgents`. The Mac App Store requires the App
Sandbox, under which an app can't run those tools across the disk or write LaunchAgents there, and
the CLIs it starts inherit the sandbox.

## Decision

- **Electron 45**, a devDependency, with the main process in `app/main.ts`, run unbuilt.
- **The server runs in-process** through `server/launch.ts`, shared with `server/main.ts`. A
  monitor already on the port is the one the window shows.
- **One window, locked to the monitor's origin.** Links elsewhere open in the browser. No preload
  and no Node in the page: `contextIsolation`, `sandbox`, no `nodeIntegration`.
- **Closing the window keeps the app running**, as macOS apps do, so the monitor keeps firing the
  schedules set to fire from it.
- **`mise run app`** builds the page, opens the app, and runs `vite build --watch` with the window
  reloading when `dist/` changes. A change to `core/` or `server/` needs a restart.
- **Distribution is outside the App Store**: a Developer ID signed, notarized download and a
  Homebrew cask, when packaging comes. `git clone` and `mise run dev` stay.

## Alternatives rejected

- **The Mac App Store**: the App Sandbox rules out the monitor's job (see Context).
- **Tauri**: a Rust shell around the system WebView. The server would have to run as a separate
  Node sidecar, since the shell has no Node, and the page would render in Safari's engine rather
  than the Chromium it's checked in.
- **A Vite dev server with HMR inside the app**: a second server with a proxy in front of the
  monitor's Host and Origin checks, against `page-vite-react.md`'s one-server rule. A rebuild and
  reload takes about a second.
- **Safari's Add to Dock alone**: no way to start the server, and nothing keeps it running.

## Consequences

- `node_modules` carries Electron's ~250 MB binary, downloaded on the first `mise run app`.
- Packaging (signing, notarizing, the `.icns`, a login item) is a later step; until then the app
  runs from the clone.
- In the packaged app, Full Disk Access goes to the app rather than to node, and schedules pass
  the app's own fire command to `systemLaunchd`.
