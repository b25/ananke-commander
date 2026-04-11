import { useEffect, useRef, useState } from 'react'

interface Props {
  paneId: string
  onFindToggle: () => void
}

export function BrowserMenu({ paneId, onFindToggle }: Props) {
  const [open, setOpen] = useState(false)
  const [harRecording, setHarRecording] = useState(false)
  const [harCount, setHarCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Refresh HAR state when menu opens
    void window.ananke.browser.harIsRecording(paneId).then(setHarRecording)
    void window.ananke.browser.harGetEntryCount(paneId).then(setHarCount)

    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, paneId])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: !open }))
    return () => {
      window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: true }))
    }
  }, [open])

  const toggleHar = async () => {
    if (harRecording) {
      await window.ananke.browser.harStop(paneId)
      setHarRecording(false)
    } else {
      await window.ananke.browser.harStart(paneId)
      setHarRecording(true)
      setHarCount(0)
    }
  }

  const saveHar = async () => {
    const data = await window.ananke.browser.harGetData(paneId)
    if (!data) return
    const path = await window.ananke.dialog.saveFile('capture.har')
    if (!path) return
    await window.ananke.fs.writeUtf8(path, JSON.stringify(data, null, 2))
    setOpen(false)
  }

  return (
    <div className="layout-picker" ref={ref}>
      <button
        type="button"
        className={`browser-toolbar__btn${open ? ' open' : ''}${harRecording ? ' browser-menu__recording' : ''}`}
        onClick={() => setOpen(!open)}
        title="Browser menu"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
        </svg>
      </button>
      {open && (
        <div className="layout-picker__popover browser-menu__popover" role="menu">
          {/* HAR section */}
          <div className="browser-menu__section-label">Network Capture (HAR)</div>
          <button type="button" className="browser-menu__item" role="menuitem" onClick={() => void toggleHar()}>
            <span className={`browser-menu__indicator ${harRecording ? 'recording' : ''}`} />
            {harRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          {harCount > 0 && (
            <button type="button" className="browser-menu__item" role="menuitem" onClick={() => void saveHar()}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Save HAR ({harCount} entries)
            </button>
          )}

          <div className="layout-picker__divider" />

          {/* Tools section */}
          <div className="browser-menu__section-label">Tools</div>
          <button type="button" className="browser-menu__item" role="menuitem" onClick={() => { onFindToggle(); setOpen(false) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Find in Page
            <span className="browser-menu__shortcut">Ctrl+F</span>
          </button>
          <button type="button" className="browser-menu__item" role="menuitem" onClick={() => { void window.ananke.browser.openDevTools(paneId); setOpen(false) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            Developer Tools
            <span className="browser-menu__shortcut">Ctrl+Shift+I</span>
          </button>

          <div className="layout-picker__divider" />

          {/* Zoom section */}
          <div className="browser-menu__section-label">Zoom</div>
          <div className="browser-menu__zoom-row">
            <button type="button" className="browser-menu__zoom-btn" onClick={() => void window.ananke.browser.setZoom(paneId, -0.1)} title="Zoom out">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button type="button" className="browser-menu__zoom-btn" onClick={() => void window.ananke.browser.resetZoom(paneId)} title="Reset zoom">
              100%
            </button>
            <button type="button" className="browser-menu__zoom-btn" onClick={() => void window.ananke.browser.setZoom(paneId, 0.1)} title="Zoom in">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
