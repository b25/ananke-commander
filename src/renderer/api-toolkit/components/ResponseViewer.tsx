import { useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Tab } from '../store'
import { StreamLog } from './GrpcPanel'
import { PanelTabStrip } from './PanelTabStrip'
import { useCopyResponse } from './response/useCopyResponse'
import { useSaveAsMockRoute } from './response/useSaveAsMockRoute'
import { useResponseViewPref } from './response/useResponseViewPref'

interface Props {
  tab: Tab
}

export function ResponseViewer({ tab }: Props) {
  const { copied, copyBody } = useCopyResponse()
  const { savedAsMock, saveAsMock } = useSaveAsMockRoute(tab)
  const { viewRaw, toggleView } = useResponseViewPref(tab)

  if (tab.protocol === 'grpc') {
    return <GrpcResponseView tab={tab} />
  }

  return (
    <HttpResponseView
      tab={tab}
      copied={copied}
      savedAsMock={savedAsMock}
      viewRaw={viewRaw}
      onToggleView={toggleView}
      onCopy={copyBody}
      onSaveMock={saveAsMock}
    />
  )
}

function HttpResponseView({
  tab,
  copied,
  savedAsMock,
  viewRaw,
  onToggleView,
  onCopy,
  onSaveMock,
}: {
  tab: Tab
  copied: boolean
  savedAsMock: boolean
  viewRaw: boolean
  onToggleView: () => void
  onCopy: (body: string) => void
  onSaveMock: () => void
}) {
  const [innerTab, setInnerTab] = useState<'body' | 'headers' | 'timing'>('body')
  const resp = tab.httpResponse
  const headerCount = resp ? Object.keys(resp.headers).length : 0

  const viewToggle = innerTab === 'body' ? (
    <>
      <button
        type="button"
        style={{ fontSize: 10, padding: '1px 8px', background: viewRaw ? 'var(--bg-4)' : 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)', cursor: 'pointer' }}
        onClick={onToggleView}
        title="Toggle raw / pretty view (saved for next response)"
      >
        {viewRaw ? 'Pretty' : 'Raw'}
      </button>
      {resp && (
        <button
          type="button"
          style={{ fontSize: 10, padding: '1px 8px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: copied ? 'var(--method-get)' : 'var(--text-1)', cursor: 'pointer' }}
          onClick={() => onCopy(resp.body)}
          title="Copy response body"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      )}
    </>
  ) : undefined

  return (
    <div className="response-viewer">
      {resp && (
        <div className="response-status-bar">
          <span className={`status-pill status-${Math.floor(resp.status / 100)}xx`}>{resp.status} {resp.statusText}</span>
          <span className="timing-label">Time:</span>
          <span className="timing-val">{resp.timings.total}ms</span>
          {resp.timings.ttfb && <>
            <span className="timing-label">TTFB:</span>
            <span className="timing-val">{resp.timings.ttfb}ms</span>
          </>}
          <span className="timing-label">Size:</span>
          <span className="timing-val">{formatSize(resp.size.body)}</span>
          <span style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              style={{ fontSize: 10, padding: '1px 8px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: savedAsMock ? 'var(--method-get)' : 'var(--text-2)', cursor: 'pointer' }}
              onClick={onSaveMock}
              title="Save request+response as mock route"
            >
              {savedAsMock ? 'Saved!' : 'Save as mock'}
            </button>
          </span>
        </div>
      )}

      <PanelTabStrip
        activeId={innerTab}
        onSelect={(id) => setInnerTab(id as typeof innerTab)}
        tabs={(['body', 'headers', 'timing'] as const).map((t) => ({
          id: t,
          label: (
            <>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'headers' && resp && <span className="panel-tab-count">{headerCount}</span>}
            </>
          ),
        }))}
        trailing={viewToggle}
      />

      {innerTab === 'body' && (
        <ResponseBodyViewport>
          {tab.loading && !tab.grpcStreamActive ? (
            <div className="atk-empty-state">
              <div className="atk-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
              <span>Sending…</span>
            </div>
          ) : tab.error && !resp ? (
            <div className="error-box" style={{ margin: 16 }}>{tab.error}</div>
          ) : !resp ? (
            <div className="atk-empty-state">
              <div className="atk-empty-state-icon">→</div>
              <span>Send a request to see the response</span>
            </div>
          ) : viewRaw ? (
            <RawBody body={resp.body} />
          ) : (
            <PrettyBody body={resp.body} contentType={resp.headers['content-type'] ?? ''} />
          )}
        </ResponseBodyViewport>
      )}

      {innerTab === 'headers' && resp && (
        <div className="panel-body">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
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

      {innerTab === 'timing' && resp && (
        <div className="panel-body">
          <TimingBar timings={resp.timings} />
        </div>
      )}

      {innerTab === 'headers' && !resp && (
        <div className="atk-empty-state"><span>No response yet</span></div>
      )}
      {innerTab === 'timing' && !resp && (
        <div className="atk-empty-state"><span>No response yet</span></div>
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
          {status.details && <span style={{ fontSize: 10, color: 'var(--text-1)' }}>{status.details}</span>}
          {tab.grpcStreamActive && (
            <><div className="atk-spinner" /><span style={{ fontSize: 10, color: 'var(--text-2)' }}>streaming</span></>
          )}
        </div>
      )}

      <PanelTabStrip
        activeId={innerTab}
        onSelect={(id) => setInnerTab(id as typeof innerTab)}
        tabs={[
          {
            id: 'messages',
            label: (
              <>
                Messages
                {messages.length > 0 && <span className="panel-tab-count">{messages.length}</span>}
              </>
            )
          },
          { id: 'status', label: 'Status' },
          { id: 'trailers', label: 'Trailers' }
        ]}
      />

      {innerTab === 'messages' && (
        <div className="response-body" style={{ padding: 0 }}>
          {messages.length === 0 && !tab.grpcStreamActive && (
            <div className="atk-empty-state">
              <div className="atk-empty-state-icon">↓</div>
              <span>No response yet</span>
            </div>
          )}
          <StreamLog messages={messages} />
        </div>
      )}

      {innerTab === 'status' && status && (
        <div className="panel-body" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div><span style={{ color: 'var(--text-2)' }}>Code: </span>{status.code} ({status.codeName})</div>
            {status.details && <div><span style={{ color: 'var(--text-2)' }}>Details: </span>{status.details}</div>}
          </div>
        </div>
      )}

      {innerTab === 'trailers' && (
        <div className="panel-body">
          {Object.entries(resp?.trailers ?? {}).length === 0
            ? <span style={{ color: 'var(--text-2)', fontSize: 10 }}>No trailers</span>
            : Object.entries(resp?.trailers ?? {}).map(([k, v]) => (
              <div key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-accent)' }}>{k}</span>: {v}
              </div>
            ))
          }
        </div>
      )}
    </div>
  )
}

const RAW_BODY_DISPLAY_MAX = 512_000

function ResponseBodyViewport({ children }: { children: ReactNode }) {
  return (
    <div
      className="response-body response-body--scroll"
      style={{ overflow: 'auto', flex: 1, minHeight: 0, contain: 'content' }}
    >
      {children}
    </div>
  )
}

function RawBody({ body }: { body: string }) {
  const truncated = body.length > RAW_BODY_DISPLAY_MAX
  const display = truncated
    ? `${body.slice(0, RAW_BODY_DISPLAY_MAX)}\n\n… ${formatSize(body.length - RAW_BODY_DISPLAY_MAX)} omitted — use Copy for full body`
    : body
  return (
    <pre style={{ margin: 0, fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      {display}
    </pre>
  )
}

function PrettyBody({ body, contentType }: { body: string; contentType: string }) {
  if (body.length > 200_000) {
    return (
      <div style={{ color: 'var(--text-2)', fontSize: 10 }}>
        Pretty view disabled for large payloads ({formatSize(body.length)}). Use Raw mode to inspect full content.
      </div>
    )
  }
  const isJson = contentType.includes('json') || (body.trimStart().startsWith('{') || body.trimStart().startsWith('['))

  if (isJson) {
    try {
      const parsed = JSON.parse(body)
      const formatted = JSON.stringify(parsed, null, 2)
      if (formatted.length <= 80_000) {
        return (
          <pre style={{ margin: 0, fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {formatted}
          </pre>
        )
      }
      return <JsonTree value={parsed} />
    } catch {
      // fall through to raw text
    }
  }

  return (
    <pre style={{ margin: 0, fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {body}
    </pre>
  )
}

const JSON_PAGE_SIZE = 40
const JSON_VIRTUAL_THRESHOLD = 48

function JsonCollapsible({ label, depth, children }: { label: string; depth: number; children: ReactNode }) {
  const [open, setOpen] = useState(depth < 2)
  return (
    <span>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--text-2)',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
          fontSize: 'inherit',
          marginRight: 4
        }}
      >
        {open ? '▼' : '▶'} {label}
      </button>
      {open ? children : null}
    </span>
  )
}

function JsonPagedList({
  items,
  depth,
  hiddenByCap,
  renderItem
}: {
  items: unknown[]
  depth: number
  hiddenByCap: number
  renderItem: (item: unknown, index: number) => ReactNode
}) {
  if (items.length >= JSON_VIRTUAL_THRESHOLD) {
    return (
      <VirtualJsonArrayList
        items={items}
        depth={depth}
        hiddenByCap={hiddenByCap}
        renderItem={renderItem}
      />
    )
  }

  return (
    <JsonPagedListSimple
      items={items}
      depth={depth}
      hiddenByCap={hiddenByCap}
      renderItem={renderItem}
    />
  )
}

function JsonPagedListSimple({
  items,
  depth,
  hiddenByCap,
  renderItem
}: {
  items: unknown[]
  depth: number
  hiddenByCap: number
  renderItem: (item: unknown, index: number) => ReactNode
}) {
  const [shown, setShown] = useState(JSON_PAGE_SIZE)
  const display = items.slice(0, shown)
  const remaining = items.length - display.length + hiddenByCap

  return (
    <>
      {display.map((item, i) => renderItem(item, i))}
      {remaining > 0 && (
        <span>
          {'  '.repeat(depth + 1)}
          <button
            type="button"
            onClick={() => setShown((n) => n + JSON_PAGE_SIZE)}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-accent)',
              cursor: 'pointer',
              fontSize: 'inherit',
              padding: 0
            }}
          >
            Show {Math.min(JSON_PAGE_SIZE, remaining)} more…
          </button>
          {'\n'}
        </span>
      )}
    </>
  )
}

function VirtualJsonArrayList({
  items,
  depth,
  hiddenByCap,
  renderItem
}: {
  items: unknown[]
  depth: number
  hiddenByCap: number
  renderItem: (item: unknown, index: number) => ReactNode
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 18,
    overscan: 12
  })

  return (
    <span style={{ display: 'block' }}>
      <div
        ref={parentRef}
        style={{ maxHeight: 360, overflow: 'auto', display: 'block' }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map((vi) => (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`
              }}
            >
              {renderItem(items[vi.index], vi.index)}
            </div>
          ))}
        </div>
      </div>
      {hiddenByCap > 0 && (
        <span>
          {'  '.repeat(depth + 1)}
          <span style={{ color: 'var(--text-2)' }}>… {hiddenByCap} items omitted (cap)</span>
          {'\n'}
        </span>
      )}
    </span>
  )
}

function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const MAX_DEPTH = 8
  const MAX_ITEMS_PER_NODE = 100

  if (typeof value === 'string') return <span className="json-string">"{value}"</span>
  if (typeof value === 'number') return <span className="json-number">{value}</span>
  if (typeof value === 'boolean') return <span className="json-bool">{String(value)}</span>
  if (value === null) return <span className="json-null">null</span>
  if (depth >= MAX_DEPTH) return <span style={{ color: 'var(--text-2)' }}>...</span>

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>
    const visibleItems = value.slice(0, MAX_ITEMS_PER_NODE)
    const hiddenCount = value.length - visibleItems.length
    return (
      <JsonCollapsible label={`[${value.length}]`} depth={depth}>
        <span>
          {'[\n'}
          <JsonPagedList
            items={visibleItems}
            depth={depth}
            hiddenByCap={hiddenCount}
            renderItem={(v, i) => (
              <span key={i}>
                {'  '.repeat(depth + 1)}
                <JsonTree value={v} depth={depth + 1} />
                {i < visibleItems.length - 1 || hiddenCount > 0 ? ',' : ''}
                {'\n'}
              </span>
            )}
          />
          {hiddenCount > 0 && (
            <span>
              {'  '.repeat(depth + 1)}
              <span style={{ color: 'var(--text-2)' }}>… {hiddenCount} items omitted (cap {MAX_ITEMS_PER_NODE})</span>
              {'\n'}
            </span>
          )}
          {'  '.repeat(depth)}{']'}
        </span>
      </JsonCollapsible>
    )
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (entries.length === 0) return <span>{'{}'}</span>
    const visibleEntries = entries.slice(0, MAX_ITEMS_PER_NODE)
    const hiddenCount = entries.length - visibleEntries.length
    return (
      <JsonCollapsible label={`{${entries.length}}`} depth={depth}>
        <span>
          {'{\n'}
          {visibleEntries.map(([k, v], i) => (
            <span key={k}>
              {'  '.repeat(depth + 1)}
              <span className="json-key">"{k}"</span>
              {': '}
              <JsonTree value={v} depth={depth + 1} />
              {i < visibleEntries.length - 1 || hiddenCount > 0 ? ',' : ''}
              {'\n'}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span>
              {'  '.repeat(depth + 1)}
              <span style={{ color: 'var(--text-2)' }}>... {hiddenCount} more fields</span>
              {'\n'}
            </span>
          )}
          {'  '.repeat(depth)}{'}'}
        </span>
      </JsonCollapsible>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10 }}>
            <span style={{ color: 'var(--text-2)' }}>{b.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>{b.ms}ms</span>
          </div>
          <div style={{ background: 'var(--bg-3)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min((b.ms / timings.total) * 100, 100)}%`, background: b.color, height: '100%', borderRadius: 3 }} />
          </div>
        </div>
      ))}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginTop: 8 }}>
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
