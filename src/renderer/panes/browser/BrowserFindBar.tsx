import type { RefObject } from 'react'

type Props = {
  findText: string
  findRef: RefObject<HTMLInputElement | null>
  onSubmit: () => void
  onFindTextChange: (value: string) => void
  onFindNext: () => void
  onFindPrev: () => void
  onClose: () => void
}

export function BrowserFindBar({
  findText,
  findRef,
  onSubmit,
  onFindTextChange,
  onFindNext,
  onFindPrev,
  onClose,
}: Props) {
  return (
    <div className="browser-find-bar">
      <form className="browser-find-bar__form" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
        <input
          ref={findRef}
          className="browser-find-bar__input"
          value={findText}
          onChange={(e) => onFindTextChange(e.target.value)}
          placeholder="Find in page..."
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose() }
            if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); onFindPrev() }
          }}
        />
        <button type="button" className="browser-toolbar__btn" title="Previous" aria-label="Find previous" onClick={onFindPrev}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
        </button>
        <button type="button" className="browser-toolbar__btn" title="Next" aria-label="Find next" onClick={onFindNext}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <button type="button" className="browser-toolbar__btn" title="Close find" aria-label="Close find in page" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </form>
    </div>
  )
}
