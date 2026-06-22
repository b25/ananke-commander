import type { RefObject } from 'react'
import { BrowserMenu } from './BrowserMenu'

type Props = {
  paneId: string
  loading: boolean
  urlInput: string
  urlRef: RefObject<HTMLInputElement | null>
  onUrlInputChange: (value: string) => void
  onSubmit: () => void
  onBack: () => void
  onForward: () => void
  onStop: () => void
  onReload: () => void
  onOpenExternal: () => void
  onFindToggle: () => void
  onClipToVault: () => void
}

export function BrowserToolbar({
  paneId,
  loading,
  urlInput,
  urlRef,
  onUrlInputChange,
  onSubmit,
  onBack,
  onForward,
  onStop,
  onReload,
  onOpenExternal,
  onFindToggle,
  onClipToVault,
}: Props) {
  return (
    <div className="browser-toolbar">
      <div className="browser-toolbar__nav">
        <button type="button" className="browser-toolbar__btn" onClick={onBack} title="Back" aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        </button>
        <button type="button" className="browser-toolbar__btn" onClick={onForward} title="Forward" aria-label="Forward">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
        {loading
          ? <button type="button" className="browser-toolbar__btn" onClick={onStop} title="Stop loading" aria-label="Stop loading">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          : <button type="button" className="browser-toolbar__btn" onClick={onReload} title="Reload" aria-label="Reload">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            </button>
        }
      </div>
      <form className="browser-toolbar__url-form" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
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
          onChange={(e) => onUrlInputChange(e.target.value)}
          placeholder="Enter URL or search..."
          spellCheck={false}
        />
        <button type="submit" className="browser-toolbar__btn" title="Go" aria-label="Go">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </form>
      <button type="button" className="browser-toolbar__btn" title="Open in system browser" aria-label="Open in system browser"
        onClick={onOpenExternal}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </button>
      <BrowserMenu paneId={paneId} onFindToggle={onFindToggle} onClipToVault={onClipToVault} />
    </div>
  )
}
