import { useState } from 'react'
import type { Tab } from '../store'
import { StreamLog } from './GrpcPanel'

interface Props {
  tab: Tab
}

export function ResponseViewer({ tab }: Props) {
  const [innerTab, setInnerTab] = useState<'body' | 'headers' | 'timing'>('body')

  // Loading state
  if (tab.loading && !tab.grpcStreamActive) {
    return (
      <div className="response-viewer">
        <div className="empty-state">
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          <span>Sending…</span>
        </div>
      </div>
    )
  }

  // Error state
  if (tab.error && !tab.httpResponse && !tab.grpcResponse) {
    return (
      <div className="response-viewer">
        <div className="error-box" style={{ margin: 16 }}>
          {tab.error}
        </div>
      </div>
    )
  }

  // gRPC response/stream
  if (tab.protocol === 'grpc') {
    return <GrpcResponseView tab={tab} />
  }

  // HTTP response
  if (!tab.httpResponse) {
    return (
      <div className="response-viewer">
        <div className="empty-state">
          <div className="empty-state-icon">→</div>
          <span>Send a request to see the response</span>
        </div>
      </div>
    )
  }

  const resp = tab.httpResponse
  const statusClass = `status-${Math.floor(resp.status / 100)}xx`

  return (
    <div className="response-viewer">
      <div className="response-status-bar">
        <span className={`status-pill ${statusClass}`}>{resp.status} {resp.statusText}</span>
        <span className="timing-label">Time:</span>
        <span className="timing-val">{resp.timings.total}ms</span>
        {resp.timings.ttfb && <>
          <span className="timing-label">TTFB:</span>
          <span className="timing-val">{resp.timings.ttfb}ms</span>
        </>}
        <span className="timing-label">Size:</span>
        <span className="timing-val">{formatSize(resp.size.body)}</span>
      </div>

      <div className="panel-tabs">
        {(['body', 'headers', 'timing'] as const).map((t) => (
          <div
            key={t}
            className={`panel-tab ${innerTab === t ? 'active' : ''}`}
            onClick={() => setInnerTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'headers' && <span className="panel-tab-count">{Object.keys(resp.headers).length}</span>}
          </div>
        ))}
      </div>

      {innerTab === 'body' && (
        <div className="response-body">
          <PrettyBody body={resp.body} contentType={resp.headers['content-type'] ?? ''} />
        </div>
      )}

      {innerTab === 'headers' && (
        <div className="panel-body">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <tbody>
              {Object.entries(resp.headers).map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px', color: 'var(--text-accent)', width: '40%', verticalAlign: 'top' }}>{k}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-1)', wordBreak: 'break-all' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {innerTab === 'timing' && (
        <div className="panel-body">
          <TimingBar timings={resp.timings} />
        </div>
      )}
    </div>
  )
}

function GrpcResponseView({ tab }: { tab: Tab }) {
  const [innerTab, setInnerTab] = useState<'messages' | 'status' | 'trailers'>('messages')
  const resp = tab.grpcResponse
  const messages = tab.grpcMessages.length > 0 ? tab.grpcMessages : (resp?.messages ?? [])
  const status = tab.grpcStreamStatus ?? resp?.status

  return (
    <div className="response-viewer">
      {status && (
        <div className="response-status-bar">
          <span className={`status-pill ${status.code === 0 ? 'status-2xx' : 'status-5xx'}`}>
            {status.codeName}
          </span>
          {status.details && <span style={{ fontSize: 12, color: 'var(--text-1)' }}>{status.details}</span>}
          {tab.grpcStreamActive && (
            <><div className="spinner" /><span style={{ fontSize: 12, color: 'var(--text-2)' }}>streaming</span></>
          )}
        </div>
      )}

      <div className="panel-tabs">
        <div className={`panel-tab ${innerTab === 'messages' ? 'active' : ''}`} onClick={() => setInnerTab('messages')}>
          Messages {messages.length > 0 && <span className="panel-tab-count">{messages.length}</span>}
        </div>
        <div className={`panel-tab ${innerTab === 'status' ? 'active' : ''}`} onClick={() => setInnerTab('status')}>
          Status
        </div>
        <div className={`panel-tab ${innerTab === 'trailers' ? 'active' : ''}`} onClick={() => setInnerTab('trailers')}>
          Trailers
        </div>
      </div>

      {innerTab === 'messages' && (
        <div className="response-body" style={{ padding: 0 }}>
          {messages.length === 0 && !tab.grpcStreamActive && (
            <div className="empty-state">
              <div className="empty-state-icon">↓</div>
              <span>No response yet</span>
            </div>
          )}
          <StreamLog messages={messages} />
        </div>
      )}

      {innerTab === 'status' && status && (
        <div className="panel-body" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div><span style={{ color: 'var(--text-2)' }}>Code: </span>{status.code} ({status.codeName})</div>
            {status.details && <div><span style={{ color: 'var(--text-2)' }}>Details: </span>{status.details}</div>}
          </div>
        </div>
      )}

      {innerTab === 'trailers' && (
        <div className="panel-body">
          {Object.entries(resp?.trailers ?? {}).length === 0
            ? <span style={{ color: 'var(--text-2)', fontSize: 12 }}>No trailers</span>
            : Object.entries(resp?.trailers ?? {}).map(([k, v]) => (
              <div key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-accent)' }}>{k}</span>: {v}
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

function PrettyBody({ body, contentType }: { body: string; contentType: string }) {
  const isJson = contentType.includes('json') || (body.trimStart().startsWith('{') || body.trimStart().startsWith('['))

  if (isJson) {
    try {
      const parsed = JSON.parse(body)
      return <JsonTree value={parsed} />
    } catch {
      // fall through to raw
    }
  }

  return <>{body}</>
}

function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (typeof value === 'string') return <span className="json-string">"{value}"</span>
  if (typeof value === 'number') return <span className="json-number">{value}</span>
  if (typeof value === 'boolean') return <span className="json-bool">{String(value)}</span>
  if (value === null) return <span className="json-null">null</span>

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>
    return (
      <span>
        {'[\n'}
        {value.map((v, i) => (
          <span key={i}>
            {'  '.repeat(depth + 1)}
            <JsonTree value={v} depth={depth + 1} />
            {i < value.length - 1 ? ',' : ''}
            {'\n'}
          </span>
        ))}
        {'  '.repeat(depth)}{']'}
      </span>
    )
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (entries.length === 0) return <span>{'{}'}</span>
    return (
      <span>
        {'{\n'}
        {entries.map(([k, v], i) => (
          <span key={k}>
            {'  '.repeat(depth + 1)}
            <span className="json-key">"{k}"</span>
            {': '}
            <JsonTree value={v} depth={depth + 1} />
            {i < entries.length - 1 ? ',' : ''}
            {'\n'}
          </span>
        ))}
        {'  '.repeat(depth)}{'}'}
      </span>
    )
  }

  return <span>{String(value)}</span>
}

function TimingBar({ timings }: { timings: { total: number; ttfb?: number; download?: number } }) {
  const bars = [
    { label: 'TTFB', ms: timings.ttfb ?? timings.total, color: 'var(--text-accent)' },
    { label: 'Download', ms: timings.download ?? 0, color: 'var(--method-get)' },
  ].filter((b) => b.ms > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bars.map((b) => (
        <div key={b.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-2)' }}>{b.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{b.ms}ms</span>
          </div>
          <div style={{ background: 'var(--bg-3)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min((b.ms / timings.total) * 100, 100)}%`, background: b.color, height: '100%', borderRadius: 3 }} />
          </div>
        </div>
      ))}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginTop: 8 }}>
        Total: <span style={{ color: 'var(--text-0)' }}>{timings.total}ms</span>
      </div>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
