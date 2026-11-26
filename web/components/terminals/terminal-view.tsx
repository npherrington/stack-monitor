import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useTerminalPanel } from '@/contexts/terminal-context.ts'
import { terminalsKey } from '@/hooks/use-terminals.ts'
import { readTerminalTheme } from '@/lib/terminal-theme.ts'
import { cn } from '@/lib/utils.ts'

// server/terminal-socket.ts's close codes.
const EXITED = 4000
const NO_SESSION = 4004

interface TerminalViewProps {
  id: string // the session it shows
  visible: boolean // the active tab of an open panel
}

function socketUrl(id: string): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/api/terminals/socket?id=${encodeURIComponent(id)}`
}

// One session's terminal. It stays mounted while its tab is hidden, so what's on screen and the
// socket survive switching tabs.
export function TerminalView({ id, visible }: TerminalViewProps) {
  const host = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const queryClient = useQueryClient()
  const { setBusy } = useTerminalPanel()

  useEffect(() => {
    const element = host.current
    if (element === null) return
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      scrollback: 5000,
      theme: readTerminalTheme(),
      // Text a program draws too close to the background (a session still in a dark theme) is
      // darkened until it reads.
      minimumContrastRatio: 4.5,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element)
    terminal.current = term

    const socket = new WebSocket(socketUrl(id))
    // Removed before the unmount closes the socket, which isn't a session ending.
    const listening = new AbortController()
    const { signal } = listening
    const send = (message: unknown) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(message))
    }
    const sendSize = () =>
      send({ type: 'resize', cols: term.cols, rows: term.rows })
    // A hidden tab has no size to fit to; it fits when it's shown.
    const refit = () => {
      if (element.clientWidth > 0) fit.fit()
    }
    socket.addEventListener(
      'open',
      () => {
        refit()
        sendSize()
      },
      { signal },
    )
    socket.addEventListener(
      'message',
      (event) => term.write(String(event.data)),
      { signal },
    )
    socket.addEventListener(
      'close',
      (event) => {
        const why =
          event.code === EXITED
            ? `claude exited (${event.reason}). Close this tab to end it.`
            : event.code === NO_SESSION
              ? 'This session has ended.'
              : "Lost the monitor. Reopen this worktree's terminal once it's back."
        setBusy(id, false)
        term.write(`\r\n\x1b[2m${why}\x1b[0m\r\n`)
        void queryClient.invalidateQueries({ queryKey: terminalsKey })
      },
      { signal },
    )
    // Claude Code reports its progress as OSC 9;4;<state>: 3 while it works (1 with a known
    // amount), 0 when it's done. A reattached page replays the latest.
    const progress = term.parser.registerOscHandler(9, (data) => {
      const state = /^4;(\d)/.exec(data)?.[1]
      if (state === undefined) return false
      setBusy(id, state === '1' || state === '3')
      return true
    })
    const typing = term.onData((data) => send({ type: 'input', data }))
    const resizing = term.onResize(sendSize)
    const sized = new ResizeObserver(refit)
    sized.observe(element)
    // The theme is set on <html> after React commits, so this watches for it there.
    const themed = new MutationObserver(() => {
      term.options.theme = readTerminalTheme()
    })
    themed.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => {
      themed.disconnect()
      sized.disconnect()
      progress.dispose()
      setBusy(id, false)
      typing.dispose()
      resizing.dispose()
      listening.abort()
      socket.close()
      term.dispose()
      terminal.current = null
    }
  }, [id, queryClient, setBusy])

  useEffect(() => {
    if (visible) terminal.current?.focus()
  }, [visible])

  return (
    // The padding sits outside the element the terminal is fitted to, which counts its own padding
    // as room for rows.
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col bg-muted py-2 pl-3',
        !visible && 'hidden',
      )}
    >
      <div ref={host} className="min-h-0 flex-1" />
    </div>
  )
}
