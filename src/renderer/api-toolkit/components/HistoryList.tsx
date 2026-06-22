import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from '../store'

const ROW_HEIGHT = 29

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

export function HistoryList() {
  const { history, openTab, clearHistory } = useStore()
  const [filter, setFilter] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  function restore(entryIdx: number) {
    const entry = history[entryIdx]
    if (!entry) return
    openTab({
      name: entry.name,
      protocol: entry.protocol,
      httpRequest: entry.httpRequest,
      grpcRequest: entry.grpcRequest,
    })
  }

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return query
      ? history.filter((entry) => {
          const url = entry.protocol === 'http' ? entry.httpRequest?.url ?? '' : entry.grpcRequest?.serviceMethod ?? ''
          return url.toLowerCase().includes(query) || (entry.httpRequest?.method ?? 'grpc').toLowerCase().includes(query)
        })
      : history
  }, [history, filter])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15
  })

  return (
    <div className="sidebar-content" ref={scrollRef}>
      <div className="sidebar-section-header">
        History
        {history.length > 0 && (
          <span
            className="sidebar-action-btn"
            title="Clear history"
            onClick={() => { clearHistory(); void window.ananke.apiToolkit.storage.clearHistory() }}
            style={{ fontSize: 10 }}
          >
            ✕
          </span>
        )}
      </div>

      {history.length > 0 && (
        <div style={{ padding: '4px 8px' }}>
          <input
            className="kv-input"
            style={{ width: '100%', fontSize: 10 }}
            placeholder="Filter history…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ padding: '24px 16px', color: 'var(--text-2)', fontSize: 10, textAlign: 'center' }}>
          {history.length === 0 ? 'No history yet.' : 'No matches.'}
        </div>
      )}

      {filtered.length > 0 && (
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = filtered[virtualRow.index]
            const idx = history.indexOf(entry)
            const method = entry.protocol === 'http' ? entry.httpRequest?.method : 'gRPC'
            const url = entry.protocol === 'http'
              ? entry.httpRequest?.url ?? ''
              : entry.grpcRequest?.serviceMethod ?? ''
            const statusCode = entry.httpResponse?.status

            return (
              <div
                className="history-entry"
                key={entry.id}
                onClick={() => restore(idx)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                <span className={`method-badge method-${method ?? 'GET'}`}>{method}</span>
                <span className="history-url">{url || '—'}</span>
                {statusCode && (
                  <span className={`status-pill status-${Math.floor(statusCode / 100)}xx`} style={{ fontSize: 10, padding: '1px 5px' }}>
                    {statusCode}
                  </span>
                )}
                <span className="history-time">{relativeTime(entry.timestamp)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
