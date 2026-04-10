import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BrowserPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'

type Props = {
  pane: BrowserPaneState
  isActive: boolean
  canvasOffset: { x: number; y: number }
  onClose: () => void
  onUpdate: (next: BrowserPaneState) => void
}

export function BrowserPlaceholderPane({ pane, isActive, canvasOffset, onClose, onUpdate }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [navHistory, setNavHistory] = useState<string[]>([])
  const [urlInput, setUrlInput] = useState(pane.url || '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setUrlInput(pane.url || '')
  }, [pane.url])

  useEffect(() => {
    void window.ananke.browser.getHistory(pane.id).then(setNavHistory)
    const unsub = window.ananke.browser.onHistory(({ paneId, urls }) => {
      if (paneId === pane.id) setNavHistory(urls)
    })
    const unsubTitle = window.ananke.browser.onTitleUpdate(({ paneId, title }) => {
      if (paneId === pane.id) onUpdate({ ...pane, title })
    })
    const unsubLoading = window.ananke.browser.onLoadingState(({ paneId, loading: l }) => {
      if (paneId === pane.id) setLoading(l)
    })
    return () => {
      unsub()
      unsubTitle()
      unsubLoading()
    }
  }, [pane.id])

  useEffect(() => {
    // Initial mount navigation
    const target = pane.url?.trim() || 'about:blank'
    void window.ananke.browser.navigate(pane.id, target)
  }, [pane.id]) // Intentionally only on pane ID change / fresh component mount

  const syncBounds = () => {
    const el = hostRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const bounds = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(Math.max(r.width, 120)),
      height: Math.round(Math.max(r.height, 120))
    }
    void window.ananke.browser.layout(pane.id, bounds)
  }

  // Re-sync on mount, active change, pane move/resize, and canvas pan
  useLayoutEffect(() => {
    syncBounds()
  }, [pane.id, isActive, pane.x, pane.y, pane.width, pane.height, canvasOffset.x, canvasOffset.y])

  useEffect(() => {
    const ro = new ResizeObserver(() => syncBounds())
    const el = hostRef.current
    if (el) ro.observe(el)
    window.addEventListener('resize', syncBounds)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncBounds)
      void window.ananke.browser.destroy(pane.id)
    }
  }, [pane.id])

  const doNav = (u: string) => {
    let target = u.trim() || 'about:blank'
    if (target !== 'about:blank' && !target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('data:') && !target.startsWith('localhost')) {
      target = 'https://' + target
    } else if (target.startsWith('localhost')) {
      target = 'http://' + target
    }
    void window.ananke.browser.navigate(pane.id, target)
    onUpdate({ ...pane, url: target })
    setUrlInput(target)
  }

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={pane.title} paneType="browser" onClose={onClose} />
      <div className="pane-body" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 8, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }} className="muted">
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button type="button" onClick={() => window.ananke.browser.goBack(pane.id)} style={{ padding: '2px 8px' }}>←</button>
            <button type="button" onClick={() => window.ananke.browser.goForward(pane.id)} style={{ padding: '2px 8px' }}>→</button>
            {loading
              ? <button type="button" onClick={() => window.ananke.browser.stop(pane.id)} style={{ padding: '2px 8px' }} title="Stop">✕</button>
              : <button type="button" onClick={() => void window.ananke.browser.reload(pane.id)} style={{ padding: '2px 8px' }} title="Reload">↺</button>
            }
            <form style={{ flex: 1, display: 'flex', gap: 4 }} onSubmit={(e) => { e.preventDefault(); doNav(urlInput) }}>
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                style={{ flex: 1 }}
                placeholder="about:blank"
              />
              <button type="submit" style={{ padding: '2px 8px' }} title="Refresh/Go">🔄</button>
            </form>
            <button type="button" className="btn-thin" title="Open in system browser"
              onClick={() => void window.ananke.shell.openExternal(pane.url)}>↗</button>
          </div>
          {loading && <div className="browser-loading-bar" />}
          {navHistory.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ marginBottom: 4 }}>Recent (capped in Settings)</div>
              <ul style={{ margin: 0, paddingLeft: 16, maxHeight: 72, overflow: 'auto' }}>
                {[...navHistory].reverse().map((u, idx) => (
                  <li key={`${navHistory.length - 1 - idx}`} style={{ marginBottom: 2 }}>
                    <button
                      type="button"
                      style={{ fontSize: 11, textAlign: 'left', maxWidth: '100%', overflow: 'hidden' }}
                      title={u}
                      onClick={() => onUpdate({ ...pane, url: u })}
                    >
                      {u}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div ref={hostRef} className="browser-host" />
      </div>
    </div>
  )
}
