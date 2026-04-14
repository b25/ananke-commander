import { useStore } from '../store'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

export function HistoryList() {
  const { history, openTab, clearHistory } = useStore()

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

  return (
    <div className="sidebar-content">
      <div className="sidebar-section-header">
        History
        {history.length > 0 && (
          <span
            className="sidebar-action-btn"
            title="Clear history"
            onClick={() => { clearHistory(); window.ananke.apiToolkit.storage.clearHistory() }}
            style={{ fontSize: 10 }}
          >
            ✕
          </span>
        )}
      </div>

      {history.length === 0 && (
        <div style={{ padding: '24px 16px', color: 'var(--text-2)', fontSize: 10, textAlign: 'center' }}>
          No history yet.
        </div>
      )}

      {history.map((entry, i) => {
        const method = entry.protocol === 'http' ? entry.httpRequest?.method : 'gRPC'
        const url = entry.protocol === 'http'
          ? entry.httpRequest?.url ?? ''
          : entry.grpcRequest?.serviceMethod ?? ''
        const statusCode = entry.httpResponse?.status

        return (
          <div className="history-entry" key={entry.id} onClick={() => restore(i)}>
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
  )
}
