import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BrowserPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'
import { BrowserActions } from './BrowserActions'
import { BrowserMenu } from './BrowserMenu'

type Props = {
  pane: BrowserPaneState
  isActive: boolean
  canvasOffset: { x: number; y: number }
  onClose: () => void
  onUpdate: (next: BrowserPaneState) => void
}

export function BrowserPlaceholderPane({ pane, isActive, canvasOffset, onClose, onUpdate }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  type HistoryEntry = { url: string; timestamp: number }
  const [navHistory, setNavHistory] = useState<HistoryEntry[]>([])
  const [urlInput, setUrlInput] = useState(pane.url || '')
  const [loading, setLoading] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const findRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  // Keep a ref to the latest pane so IPC callbacks never use stale closures
  const paneRef = useRef(pane)
  paneRef.current = pane
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    setUrlInput(pane.url || '')
  }, [pane.url])

  useEffect(() => {
    void window.ananke.browser.getHistory(pane.id).then(setNavHistory)
    const unsub = window.ananke.browser.onHistory(({ paneId, entries }) => {
      if (paneId === pane.id) setNavHistory(entries)
    })
    const unsubTitle = window.ananke.browser.onTitleUpdate(({ paneId, title }) => {
      if (paneId === pane.id) onUpdateRef.current({ ...paneRef.current, title })
    })
    const unsubLoading = window.ananke.browser.onLoadingState(({ paneId, loading: l }) => {
      if (paneId === pane.id) setLoading(l)
    })
    const unsubUrl = window.ananke.browser.onUrlUpdate(({ paneId, url }) => {
      if (paneId === pane.id) {
        setUrlInput(url)
        onUpdateRef.current({ ...paneRef.current, url })
      }
    })
    const unsubClip = window.ananke.browser.onClipToVault(({ paneId }) => {
      if (paneId === pane.id) void clipPageToVault(pane.id)
    })
    return () => {
      unsub()
      unsubTitle()
      unsubLoading()
      unsubUrl()
      unsubClip()
    }
  }, [pane.id])

  useEffect(() => {
    // Initial mount navigation
    const target = pane.url?.trim() || 'about:blank'
    void window.ananke.browser.navigate(pane.id, target)
  }, [pane.id]) // Intentionally only on pane ID change / fresh component mount

  const nativeVisibleRef = useRef(true)

  useEffect(() => {
    const handler = (e: CustomEvent<boolean>) => {
      nativeVisibleRef.current = e.detail
      syncBounds()
    }
    window.addEventListener('native-view-visibility', handler as EventListener)
    return () => window.removeEventListener('native-view-visibility', handler as EventListener)
  }, [])

  const syncBounds = () => {
    const el = hostRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    
    // In Ananke, native WebContentsViews float above the Chromium compositor and ignore CSS `overflow: clip`.
    // If the canvas pans out of bounds, the bounds reflect negative coordinates and the View overlays the toolbar!
    // We must manually intersect the DOM element's bounds with the canvas workspace container limits.
    const container = el.closest('.canvas-workspace')
    let isVisible = nativeVisibleRef.current

    if (container && isVisible) {
      const cr = container.getBoundingClientRect()
      const intersectRight = Math.min(r.right, cr.right)
      const intersectBottom = Math.min(r.bottom, cr.bottom)
      const intersectX = Math.max(r.x, cr.x)
      const intersectY = Math.max(r.y, cr.y)

      const intersectW = intersectRight - intersectX
      const intersectH = intersectBottom - intersectY

      if (intersectW <= 0 || intersectH <= 0) {
        isVisible = false
      } else {
        // Feed the rigidly cropped coordinates directly to Electron layout.
        // This physically prevents Native Views from bleeding over the top menu Toolbar during any panning behavior.
        const bounds = {
          x: Math.round(intersectX),
          y: Math.round(intersectY),
          width: Math.round(Math.max(intersectW, 120)),
          height: Math.round(Math.max(intersectH, 120))
        }
        void window.ananke.browser.layout(pane.id, bounds)
        return
      }
    }

    if (!isVisible) {
      void window.ananke.browser.layout(pane.id, { x: -9999, y: -9999, width: 10, height: 10 })
      return
    }

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
      // Suspend (hide offscreen) instead of destroy — keeps the page alive
      // when pane is collapsed. Actual destroy happens via explicit close.
      void window.ananke.browser.suspend(pane.id)
    }
  }, [pane.id])

  // Keyboard shortcuts when this pane is active
  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'l') { e.preventDefault(); urlRef.current?.focus(); urlRef.current?.select() }
      if (mod && e.key === 'r') { e.preventDefault(); void window.ananke.browser.reload(pane.id) }
      if (mod && e.key === 'f') { e.preventDefault(); setFindOpen(true); setTimeout(() => findRef.current?.focus(), 50) }
      if (mod && e.shiftKey && e.key === 'I') { e.preventDefault(); void window.ananke.browser.openDevTools(pane.id) }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); void window.ananke.browser.setZoom(pane.id, 0.1) }
      if (mod && e.key === '-') { e.preventDefault(); void window.ananke.browser.setZoom(pane.id, -0.1) }
      if (mod && e.key === '0') { e.preventDefault(); void window.ananke.browser.resetZoom(pane.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, pane.id])

  const clipPageToVault = async (id: string) => {
    const snap = await window.ananke.state.get()
    const { vaultPath, subfolder } = snap.settings.obsidian
    if (!vaultPath) {
      alert('Set Obsidian vault path in Settings first.')
      return
    }
    const info = await window.ananke.browser.getPageInfo(id)
    if (!info) return
    const content = info.selectedText || info.bodyText.slice(0, 20000)
    const date = new Date().toISOString()
    const safeTitle = (info.title || 'Untitled').replace(/[/\\:*?"<>|]/g, '-')
    const body = [
      '---',
      `title: "${info.title}"`,
      `url: ${info.url}`,
      `date: ${date}`,
      `tags: [web-clipper]`,
      '---',
      '',
      `# ${info.title}`,
      '',
      content
    ].join('\n')
    await window.ananke.notes.saveVault(vaultPath, subfolder, safeTitle, body)
    alert(`Saved to vault: ${subfolder}/${safeTitle}.md`)
  }

  const looksLikeUrl = (input: string): boolean => {
    if (input.includes(' ')) return false
    // IP address (v4)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/.test(input)) return true
    // Has a dot followed by at least 2 chars (domain-like: example.com, foo.co.uk)
    if (/\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(input)) return true
    // Contains port number (e.g. myhost:3000)
    if (/^[a-zA-Z0-9_-]+(:\d+)(\/.*)?$/.test(input)) return true
    return false
  }

  const doNav = (u: string) => {
    let target = u.trim() || 'about:blank'
    if (target === 'about:blank') {
      // no-op
    } else if (/^(https?:\/\/|data:)/.test(target)) {
      // Already has protocol
    } else if (/^localhost(:\d+)?/.test(target)) {
      target = 'http://' + target
    } else if (looksLikeUrl(target)) {
      target = 'https://' + target
    } else {
      // Treat as search query
      target = 'https://www.google.com/search?q=' + encodeURIComponent(target)
    }
    void window.ananke.browser.navigate(pane.id, target)
    onUpdate({ ...pane, url: target })
    setUrlInput(target)
  }

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader 
        title={pane.title} 
        paneType="browser" 
        onClose={onClose} 
        actions={<BrowserActions navHistory={navHistory} pane={pane} onUpdate={onUpdate} />}
      />
      <div className="pane-body browser-pane-body">
        <div className="browser-toolbar">
          <div className="browser-toolbar__nav">
            <button type="button" className="browser-toolbar__btn" onClick={() => window.ananke.browser.goBack(pane.id)} title="Back">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
            </button>
            <button type="button" className="browser-toolbar__btn" onClick={() => window.ananke.browser.goForward(pane.id)} title="Forward">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </button>
            {loading
              ? <button type="button" className="browser-toolbar__btn" onClick={() => window.ananke.browser.stop(pane.id)} title="Stop loading">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              : <button type="button" className="browser-toolbar__btn" onClick={() => void window.ananke.browser.reload(pane.id)} title="Reload">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                </button>
            }
          </div>
          <form className="browser-toolbar__url-form" onSubmit={(e) => { e.preventDefault(); doNav(urlInput) }}>
            <span className="browser-toolbar__ssl-indicator" title={urlInput.startsWith('https://') ? 'Secure connection' : urlInput.startsWith('http://') ? 'Not secure' : ''}>
              {urlInput.startsWith('https://') ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              ) : urlInput.startsWith('http://') ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warning, #e8a838)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 7.5-4.33"/></svg>
              ) : null}
            </span>
            <input
              ref={urlRef}
              className="browser-toolbar__url-input"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Enter URL or search..."
              spellCheck={false}
            />
            <button type="submit" className="browser-toolbar__btn" title="Go">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </button>
          </form>
          <button type="button" className="browser-toolbar__btn" title="Open in system browser"
            onClick={() => void window.ananke.shell.openExternal(pane.url)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <BrowserMenu paneId={pane.id} onFindToggle={() => { setFindOpen(v => !v); setTimeout(() => findRef.current?.focus(), 50) }} onClipToVault={() => void clipPageToVault(pane.id)} />
        </div>
        {findOpen && (
          <div className="browser-find-bar">
            <form className="browser-find-bar__form" onSubmit={(e) => { e.preventDefault(); void window.ananke.browser.findInPage(pane.id, findText, true) }}>
              <input
                ref={findRef}
                className="browser-find-bar__input"
                value={findText}
                onChange={(e) => {
                  setFindText(e.target.value)
                  if (e.target.value) void window.ananke.browser.findInPage(pane.id, e.target.value, true)
                }}
                placeholder="Find in page..."
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setFindOpen(false); void window.ananke.browser.stopFindInPage(pane.id) }
                  if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); void window.ananke.browser.findInPage(pane.id, findText, false) }
                }}
              />
              <button type="button" className="browser-toolbar__btn" title="Previous" onClick={() => void window.ananke.browser.findInPage(pane.id, findText, false)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
              </button>
              <button type="button" className="browser-toolbar__btn" title="Next" onClick={() => void window.ananke.browser.findInPage(pane.id, findText, true)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <button type="button" className="browser-toolbar__btn" title="Close find" onClick={() => { setFindOpen(false); void window.ananke.browser.stopFindInPage(pane.id) }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </form>
          </div>
        )}
        {loading && <div className="browser-loading-bar" />}
        <div ref={hostRef} className="browser-host" />
      </div>
    </div>
  )
}
