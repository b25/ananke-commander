import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'

function clampScrollback(n: number): number {
  return Math.min(50_000, Math.max(100, Math.floor(n) || 1000))
}

// Track which pane IDs already have a PTY process running in the main process.
// This prevents double-spawning on React remounts (HMR, layout changes, etc.).
const spawnedPanes = new Set<string>()

export function useXterm(paneId: string, cwd: string | undefined, scrollback: number, onTitleChange?: (title: string) => void, cmd?: string, args?: string[]) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Restore visibility if previously hidden
    host.style.display = ''

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      scrollback: clampScrollback(scrollback),
      theme: { background: '#0d1117', foreground: '#e6edf3' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)

    const webLinks = new WebLinksAddon((_, uri) => {
      void window.ananke.shell.openExternal(uri)
    })
    term.loadAddon(webLinks)

    let webgl: WebglAddon | null = null
    try {
      webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        try { webgl?.dispose() } catch { /* ignore */ }
        webgl = null
      })
      term.loadAddon(webgl)
    } catch {
      /* DOM renderer fallback */
    }
    termRef.current = term
    fitRef.current = fit

    term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (sel) void window.ananke.clipboard.writeText(sel)
    })

    const d = window.ananke.pty.onData(({ paneId: id, data }) => {
      if (id === paneId) term.write(data)
    })
    const x = window.ananke.pty.onExit(({ paneId: id }) => {
      if (id === paneId) {
        term.writeln('\r\n[Process exited]')
        spawnedPanes.delete(paneId)
      }
    })

    const sub = term.onData((data) => {
      void window.ananke.pty.write(paneId, data)
    })

    const subTitle = term.onTitleChange((title) => {
      if (onTitleChange) onTitleChange(title)
    })

    // Spawn PTY once we have real layout dimensions, but only if not already running.
    let resizeFrame: number

    const doSpawnIfNeeded = () => {
      if (spawnedPanes.has(paneId)) return
      spawnedPanes.add(paneId)
      void window.ananke.pty.spawn(paneId, term.cols || 80, term.rows || 24, cwd || undefined, cmd, args)
    }

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        if (!termRef.current) return
        if (!host.clientWidth || !host.clientHeight) return
        try { fit.fit() } catch { /* ignore */ }
        if (!spawnedPanes.has(paneId)) {
          doSpawnIfNeeded()
        } else if (term.cols && term.rows) {
          void window.ananke.pty.resize(paneId, term.cols, term.rows)
        }
      })
    })
    ro.observe(host)

    // If the host already has dimensions at mount time, spawn immediately.
    if (host.clientWidth > 0 && host.clientHeight > 0) {
      try { fit.fit() } catch { /* ignore */ }
      doSpawnIfNeeded()
    }

    return () => {
      cancelAnimationFrame(resizeFrame)
      ro.disconnect()
      sub.dispose()
      subTitle.dispose()
      d()
      x()
      // Do NOT dispose the PTY here — keep it alive across remounts.
      // The PTY is disposed by state:closePane in the main process when
      // the pane is actually closed.

      host.style.display = 'none'
      setTimeout(() => {
        try { webgl?.dispose() } catch {}
        try { term.dispose() } catch {}
      }, 50)

      termRef.current = null
      fitRef.current = null
    }
  }, [paneId, cwd])

  useEffect(() => {
    const t = termRef.current
    if (t) t.options.scrollback = clampScrollback(scrollback)
  }, [scrollback])

  return { hostRef, fitRef, termRef }
}
