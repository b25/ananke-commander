import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'

function clampScrollback(n: number): number {
  return Math.min(50_000, Math.max(100, Math.floor(n) || 10_000))
}

// Track which pane IDs already have a PTY process running in the main process.
const spawnedPanes = new Set<string>()

// Ring buffer of PTY output per pane so we can replay on remount.
// Keeps up to MAX_BUFFER_SIZE bytes of recent output.
const MAX_BUFFER_SIZE = 512 * 1024 // 512 KB — enough for ~10K+ lines
const outputBuffers = new Map<string, string[]>()
const outputSizes = new Map<string, number>()

function appendBuffer(paneId: string, data: string): void {
  let buf = outputBuffers.get(paneId)
  if (!buf) { buf = []; outputBuffers.set(paneId, buf) }
  buf.push(data)
  const size = (outputSizes.get(paneId) || 0) + data.length
  outputSizes.set(paneId, size)
  // Trim oldest chunks if over limit
  while (size > MAX_BUFFER_SIZE && buf.length > 1) {
    const removed = buf.shift()!
    outputSizes.set(paneId, (outputSizes.get(paneId) || 0) - removed.length)
  }
}

function drainBuffer(paneId: string): string {
  const buf = outputBuffers.get(paneId)
  if (!buf || buf.length === 0) return ''
  return buf.join('')
}

function clearBuffer(paneId: string): void {
  outputBuffers.delete(paneId)
  outputSizes.delete(paneId)
}

// Global listener that captures PTY data even when no Terminal is mounted.
// This ensures output produced while the component is unmounted is buffered.
const globalListenerActive = { value: false }
function ensureGlobalListener(): void {
  if (globalListenerActive.value) return
  globalListenerActive.value = true
  window.ananke.pty.onData(({ paneId, data }) => {
    if (spawnedPanes.has(paneId)) appendBuffer(paneId, data)
  })
  window.ananke.pty.onExit(({ paneId }) => {
    spawnedPanes.delete(paneId)
  })
}

export function useXterm(paneId: string, cwd: string | undefined, scrollback: number, onTitleChange?: (title: string) => void, cmd?: string, args?: string[]) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    ensureGlobalListener()

    const host = hostRef.current
    if (!host) return

    host.style.display = ''

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 8,
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

    // Replay buffered output from before this mount
    const buffered = drainBuffer(paneId)
    if (buffered) term.write(buffered)

    term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (sel) void window.ananke.clipboard.writeText(sel)
    })

    // Local listener writes to xterm in real-time (global listener buffers)
    const d = window.ananke.pty.onData(({ paneId: id, data }) => {
      if (id === paneId) term.write(data)
    })
    const x = window.ananke.pty.onExit(({ paneId: id }) => {
      if (id === paneId) {
        term.writeln('\r\n[Process exited]')
        spawnedPanes.delete(paneId)
        clearBuffer(paneId)
      }
    })

    const sub = term.onData((data) => {
      void window.ananke.pty.write(paneId, data)
    })

    const subTitle = term.onTitleChange((title) => {
      if (onTitleChange) onTitleChange(title)
    })

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
