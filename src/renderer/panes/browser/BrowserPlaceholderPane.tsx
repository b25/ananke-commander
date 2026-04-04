import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BrowserPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'

type Props = {
  pane: BrowserPaneState
  isActive: boolean
  onClose: () => void
  onUpdate: (next: BrowserPaneState) => void
}

export function BrowserPlaceholderPane({ pane, isActive, onClose, onUpdate }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [navHistory, setNavHistory] = useState<string[]>([])

  useEffect(() => {
    void window.ananke.browser.getHistory(pane.id).then(setNavHistory)
    const unsub = window.ananke.browser.onHistory(({ paneId, urls }) => {
      if (paneId === pane.id) setNavHistory(urls)
    })
    return () => {
      unsub()
    }
  }, [pane.id])

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
    const url = pane.url?.trim() || 'https://example.com/'
    void window.ananke.browser.layout(pane.id, url, bounds)
  }

  useLayoutEffect(() => {
    syncBounds()
  }, [pane.id, pane.url, isActive])

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

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={pane.title} onClose={onClose} />
      <div className="pane-body">
        <div style={{ padding: 8, fontSize: 12 }} className="muted">
          Allowlisted: example.com, localhost. URL:
          <input
            value={pane.url}
            onChange={(e) => onUpdate({ ...pane, url: e.target.value })}
            style={{ width: '100%', marginTop: 6 }}
          />
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
