import { useEffect, useRef, useState } from 'react'
import type { BrowserPaneState } from '../../../shared/contracts'

type HistoryEntry = { url: string; timestamp: number }

interface Props {
  navHistory: HistoryEntry[]
  pane: BrowserPaneState
  onUpdate: (next: BrowserPaneState) => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return time
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export function BrowserActions({ navHistory, pane, onUpdate }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
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
  }, [open])

  useEffect(() => {
    if (open) {
      setSearch('')
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: !open }))
    return () => {
      window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: true }))
    }
  }, [open])

  const filtered = search.trim()
    ? navHistory.filter(e => e.url.toLowerCase().includes(search.toLowerCase()))
    : navHistory

  return (
    <div className="layout-picker" ref={ref}>
      <button
        type="button"
        className={`layout-picker__trigger btn-thin${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
        title="History"
      >
        History {navHistory.length > 0 && <span className="browser-history__count">{navHistory.length}</span>}
        <span className="layout-picker__chevron">&#9662;</span>
      </button>
      {open && (
        <div className="layout-picker__popover browser-history__popover" role="menu">
          <div className="browser-history__header">
            <input
              ref={searchRef}
              className="browser-history__search"
              type="text"
              placeholder="Filter history..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {navHistory.length > 0 && (
              <button
                type="button"
                className="browser-history__clear-btn"
                title="Clear history"
                onClick={() => {
                  void window.ananke.browser.clearHistory(pane.id)
                  setOpen(false)
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="browser-history__list">
            {filtered.length === 0 && (
              <div className="browser-history__empty">
                {search ? 'No matches' : 'No history yet'}
              </div>
            )}
            {[...filtered].reverse().map((entry, idx) => (
              <button
                key={`${filtered.length - 1 - idx}`}
                type="button"
                className="browser-history__item"
                role="menuitem"
                title={entry.url}
                onClick={() => {
                  void window.ananke.browser.navigate(pane.id, entry.url)
                  onUpdate({ ...pane, url: entry.url })
                  setOpen(false)
                }}
              >
                <span className="browser-history__url">{entry.url}</span>
                <span className="browser-history__time">{formatTime(entry.timestamp)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
