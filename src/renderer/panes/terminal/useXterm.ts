import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

function clampScrollback(n: number): number {
  return Math.min(50_000, Math.max(100, Math.floor(n) || 1000))
}

export function useXterm(paneId: string, cwd: string | undefined, scrollback: number, onTitleChange?: (title: string) => void) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      scrollback: clampScrollback(scrollback),
      theme: { background: '#0d1117', foreground: '#e6edf3' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    let webgl: WebglAddon | null = null
    try {
      webgl = new WebglAddon()
      term.loadAddon(webgl)
    } catch {
      /* DOM renderer fallback */
    }
    termRef.current = term
    fitRef.current = fit

    const d = window.ananke.pty.onData(({ paneId: id, data }) => {
      if (id === paneId) term.write(data)
    })
    const x = window.ananke.pty.onExit(({ paneId: id }) => {
      if (id === paneId) term.writeln('\r\n[Process exited]')
    })

    if (host.clientWidth > 0 && host.clientHeight > 0) {
      try { fit.fit() } catch { /* ignore */ }
    }
    void window.ananke.pty.spawn(paneId, term.cols, term.rows, cwd || undefined)

    const sub = term.onData((data) => {
      void window.ananke.pty.write(paneId, data)
    })

    const subTitle = term.onTitleChange((title) => {
      if (onTitleChange) onTitleChange(title)
    })

    let resizeFrame: number
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        try {
          if (!termRef.current) return // component already unmounted
          if (!host.clientWidth || !host.clientHeight) return
          fit.fit()
          if (term.cols && term.rows) {
            void window.ananke.pty.resize(paneId, term.cols, term.rows)
          }
        } catch {
          /* DOM dimensions invalid, ignore resize */
        }
      })
    })
    ro.observe(host)

    /* scrollback prop updates use the following effect so we do not respawn the PTY */
    return () => {
      cancelAnimationFrame(resizeFrame)
      ro.disconnect()
      sub.dispose()
      subTitle.dispose()
      d()
      x()
      void window.ananke.pty.dispose(paneId)
      
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
