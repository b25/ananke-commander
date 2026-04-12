import { useEffect, useRef, useState } from 'react'
import '@xterm/xterm/css/xterm.css'
import type { TerminalPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'
import { useXterm } from './useXterm'

type Props = {
  pane: TerminalPaneState
  isActive: boolean
  scrollback: number
  fontSize: number
  fontFamily: string
  onUpdate: (next: TerminalPaneState) => void
  onClose: () => void
}

export function TerminalPane({ pane, isActive, scrollback, fontSize, fontFamily, onUpdate, onClose }: Props) {
  const [termTitle, setTermTitle] = useState(pane.cwd)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const paneRef = useRef(pane)
  paneRef.current = pane
  const lastCwdRef = useRef(pane.cwd)
  const lastTitleRef = useRef(pane.cwd)
  const homeDirRef = useRef('')
  const cwdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { void window.ananke.getPath('home').then((h: string) => { homeDirRef.current = h }) }, [])
  useEffect(() => { return () => { if (cwdTimerRef.current) clearTimeout(cwdTimerRef.current) } }, [])

  const { hostRef, fitRef, termRef } = useXterm(pane.id, pane.cwd, scrollback, (title) => {
    let cleanTitle = title.replace(/^🖥\s*/, '')
    cleanTitle = cleanTitle.replace(/^[^@\s]+@[^:\s]+:\s*/, '')
    const display = cleanTitle || pane.cwd
    if (display !== lastTitleRef.current) {
      lastTitleRef.current = display
      setTermTitle(display)
    }
    // Expand ~ to absolute home path before persisting (debounced)
    let absCwd = cleanTitle
    if (absCwd && absCwd.startsWith('~') && homeDirRef.current) {
      absCwd = homeDirRef.current + absCwd.slice(1)
    }
    if (absCwd && absCwd.startsWith('/') && absCwd !== lastCwdRef.current) {
      lastCwdRef.current = absCwd
      if (cwdTimerRef.current) clearTimeout(cwdTimerRef.current)
      cwdTimerRef.current = setTimeout(() => {
        onUpdate({ ...paneRef.current, cwd: absCwd })
      }, 1000)
    }
  }, undefined, undefined, fontSize, fontFamily)

  useEffect(() => {
    if (isActive) {
      if (termRef.current) {
        // Yield momentarily to allow React DOM render cycle to quiesce before stealing OS focus
        setTimeout(() => termRef.current?.focus(), 10)
      }
      const timer = requestAnimationFrame(() => {
        try {
          if (hostRef.current && hostRef.current.clientWidth > 0 && hostRef.current.clientHeight > 0) {
            fitRef.current?.fit()
          }
        } catch { /* ignore */ }
      })
      return () => cancelAnimationFrame(timer)
    }
  }, [isActive, fitRef, termRef])

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={termTitle} paneType="terminal" onClose={onClose} />
      <div className="pane-body" onClick={() => setCtxMenu(null)}>
        <div
          ref={hostRef}
          className="terminal-host"
          onContextMenu={(e) => {
            e.preventDefault()
            setCtxMenu({ x: e.clientX, y: e.clientY })
          }}
        />
        {ctxMenu && (
          <div
            style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 200 }}
            className="ctx-menu"
            onMouseLeave={() => setCtxMenu(null)}
          >
            <button type="button" className="ctx-menu__item" onClick={() => {
              const sel = termRef.current?.getSelection()
              if (sel) void window.ananke.clipboard.writeText(sel)
              setCtxMenu(null)
            }}>Copy</button>
            <button type="button" className="ctx-menu__item" onClick={async () => {
              try {
                const text = await navigator.clipboard.readText()
                if (text) void window.ananke.pty.write(pane.id, text)
              } catch { /* ignore */ }
              setCtxMenu(null)
            }}>Paste</button>
            <div className="ctx-menu__sep" />
            <button type="button" className="ctx-menu__item" onClick={() => {
              termRef.current?.clear()
              setCtxMenu(null)
            }}>Clear</button>
          </div>
        )}
      </div>
    </div>
  )
}
