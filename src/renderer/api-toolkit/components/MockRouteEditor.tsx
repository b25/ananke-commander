import { useState } from 'react'
import type { MockRoute } from '../../../shared/api-toolkit-contracts'
import { KvEditor } from './KvEditor'

interface Props {
  route?: MockRoute
  onSave: (route: MockRoute) => void
  onCancel: () => void
}

function headersToKv(h: Record<string, string>) {
  return Object.entries(h).map(([key, value]) => ({ key, value, enabled: true }))
}

function kvToHeaders(rows: { key: string; value: string; enabled: boolean }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    if (r.enabled && r.key) out[r.key] = r.value
  }
  return out
}

export function MockRouteEditor({ route, onSave, onCancel }: Props) {
  const isNew = !route
  const [name, setName] = useState(route?.name ?? '')
  const [method, setMethod] = useState<string>(route?.method ?? 'GET')
  const [urlPattern, setUrlPattern] = useState(route?.urlPattern ?? '')
  const [statusCode, setStatusCode] = useState(route?.statusCode ?? 200)
  const [headerRows, setHeaderRows] = useState(() => headersToKv(route?.responseHeaders ?? {}))
  const [responseBody, setResponseBody] = useState(route?.responseBody ?? '')
  const [delay, setDelay] = useState(route?.delay ?? 0)
  const [error, setError] = useState('')

  function handleSave() {
    if (!urlPattern.trim()) { setError('URL pattern is required'); return }
    if (statusCode < 100 || statusCode > 599) { setError('Status code must be 100–599'); return }

    const saved: MockRoute = {
      id: route?.id ?? crypto.randomUUID(),
      name: name || urlPattern,
      enabled: route?.enabled ?? true,
      method: method as MockRoute['method'],
      urlPattern: urlPattern.trim(),
      statusCode,
      responseHeaders: kvToHeaders(headerRows),
      responseBody,
      delay,
      hitCount: route?.hitCount ?? 0,
      createdAt: route?.createdAt ?? Date.now(),
    }
    onSave(saved)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 11, color: 'var(--text-0)' }}>
        {isNew ? 'New Mock Route' : 'Edit Mock Route'}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && (
          <div className="error-box" style={{ padding: '4px 8px', fontSize: 10 }}>{error}</div>
        )}

        <label style={labelStyle}>
          <span style={labelTextStyle}>Name</span>
          <input
            style={inputStyle}
            value={name}
            placeholder="My route (optional)"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div style={{ display: 'flex', gap: 6 }}>
          <label style={{ ...labelStyle, flex: '0 0 auto' }}>
            <span style={labelTextStyle}>Method</span>
            <select style={selectStyle} value={method} onChange={(e) => setMethod(e.target.value)}>
              {['*', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
                <option key={m} value={m}>{m === '*' ? 'ANY' : m}</option>
              ))}
            </select>
          </label>
          <label style={{ ...labelStyle, flex: 1 }}>
            <span style={labelTextStyle}>URL Pattern</span>
            <input
              style={inputStyle}
              value={urlPattern}
              placeholder="/api/users/*"
              onChange={(e) => { setUrlPattern(e.target.value); setError('') }}
            />
          </label>
        </div>

        <label style={{ ...labelStyle, flex: '0 0 auto', width: 100 }}>
          <span style={labelTextStyle}>Status Code</span>
          <input
            style={inputStyle}
            type="number"
            value={statusCode}
            min={100}
            max={599}
            onChange={(e) => { setStatusCode(Number(e.target.value)); setError('') }}
          />
        </label>

        <label style={{ ...labelStyle, flex: '0 0 auto', width: 120 }}>
          <span style={labelTextStyle}>Delay (ms)</span>
          <input
            style={inputStyle}
            type="number"
            value={delay}
            min={0}
            onChange={(e) => setDelay(Math.max(0, Number(e.target.value)))}
          />
        </label>

        <div>
          <div style={labelTextStyle}>Response Headers</div>
          <KvEditor rows={headerRows} onChange={setHeaderRows} keyPlaceholder="Header" valuePlaceholder="Value" />
        </div>

        <label style={{ ...labelStyle, flex: 1 }}>
          <span style={labelTextStyle}>Response Body</span>
          <textarea
            style={{ ...inputStyle, height: 120, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 10 }}
            value={responseBody}
            placeholder='{"ok": true}'
            onChange={(e) => setResponseBody(e.target.value)}
          />
        </label>
      </div>

      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button style={btnStyle} onClick={onCancel}>Cancel</button>
        <button style={{ ...btnStyle, background: 'var(--text-accent)', color: 'var(--bg-0)', borderColor: 'var(--text-accent)' }} onClick={handleSave}>
          {isNew ? 'Add Route' : 'Save'}
        </button>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 }
const labelTextStyle: React.CSSProperties = { fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const inputStyle: React.CSSProperties = { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-0)', fontSize: 11, padding: '4px 6px', outline: 'none', width: '100%', boxSizing: 'border-box' }
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
const btnStyle: React.CSSProperties = { fontSize: 10, padding: '4px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)', cursor: 'pointer' }
