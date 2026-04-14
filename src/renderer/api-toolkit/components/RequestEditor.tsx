import { useEffect, useState } from 'react'
import { useStore } from '../store'
import type { Tab } from '../store'
import type { HttpMethod, AuthConfig } from '../../../shared/api-toolkit-contracts'
import { KvEditor } from './KvEditor'
import { GrpcPanel } from './GrpcPanel'
import { applyVarsToHttpRequest } from '../lib/substituteVars'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']

interface Props {
  tab: Tab
}

export function RequestEditor({ tab }: Props) {
  const { setHttpMethod, setHttpUrl, setHttpParams, setHttpHeaders, setHttpBody, setHttpAuth, updateTab, saveTabToCollection, collections, addItemToCollection, environments, activeEnvironmentId } = useStore()
  const req = tab.httpRequest
  const [innerTab, setInnerTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSavePicker, setShowSavePicker] = useState(false)
  const [showCurlImport, setShowCurlImport] = useState(false)
  const [curlInput, setCurlInput] = useState('')
  const [curlError, setCurlError] = useState<string | null>(null)

  // Cmd+S / Ctrl+S to save; Cmd+Enter / Ctrl+Enter to send
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void handleSave()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (tab.protocol === 'http' && !sending && req.url) void send()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab.id, tab.collectionId, tab.protocol, sending, req.url])

  async function handleSave() {
    if (saving) return
    if (tab.collectionId && tab.requestId) {
      setSaving(true)
      try { await saveTabToCollection(tab.id) } finally { setSaving(false) }
    } else {
      setShowSavePicker(true)
    }
  }

  async function saveToCollection(colId: string) {
    setShowSavePicker(false)
    setSaving(true)
    const itemId = crypto.randomUUID()
    const item = {
      type: 'request' as const,
      id: itemId,
      name: tab.name || req.url || 'New Request',
      protocol: tab.protocol,
      httpRequest: tab.httpRequest,
      grpcRequest: tab.grpcRequest,
    }
    try {
      await addItemToCollection(colId, item)
      updateTab(tab.id, { collectionId: colId, requestId: itemId, dirty: false })
    } finally {
      setSaving(false)
    }
  }

  const enabledParams = req.params.filter((p) => p.enabled && p.key).length
  const enabledHeaders = req.headers.filter((h) => h.enabled && h.key).length

  async function importCurl() {
    setCurlError(null)
    try {
      const parsed = await window.ananke.apiToolkit.curl.fromCurl(curlInput)
      updateTab(tab.id, { httpRequest: parsed, protocol: 'http', dirty: true })
      setShowCurlImport(false)
      setCurlInput('')
    } catch (e) {
      setCurlError(String(e))
    }
  }

  async function exportCurl() {
    try {
      const curlStr = await window.ananke.apiToolkit.curl.toCurl(req)
      await window.ananke.clipboard.writeText(curlStr)
    } catch { /* ignore */ }
  }

  async function send() {
    setSending(true)
    updateTab(tab.id, { loading: true, error: null, httpResponse: null })
    const id = tab.id
    const activeVars = environments.find((e) => e.id === activeEnvironmentId)?.variables.filter((v) => v.enabled) ?? []
    const resolvedReq = applyVarsToHttpRequest(req, activeVars)
    try {
      const resp = await window.ananke.apiToolkit.http.send(id, resolvedReq)
      updateTab(id, { httpResponse: resp, loading: false })
      // persist history
      window.ananke.apiToolkit.storage.addHistory({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        protocol: 'http',
        name: req.url || 'Request',
        httpRequest: req,
        httpResponse: resp,
        duration: resp.timings.total,
      })
    } catch (e) {
      updateTab(id, { error: String(e), loading: false })
    } finally {
      setSending(false)
    }
  }

  function cancel() {
    window.ananke.apiToolkit.http.cancel(tab.id)
    updateTab(tab.id, { loading: false })
    setSending(false)
  }

  if (tab.protocol === 'grpc') {
    return (
      <div className="request-editor" style={{ flex: '0 0 auto', maxHeight: '50%', overflow: 'hidden' }}>
        <div className="url-bar" style={{ paddingBottom: 4 }}>
          <span className="method-badge method-grpc" style={{ fontSize: 10 }}>gRPC</span>
          <span style={{ flex: 1, color: 'var(--text-2)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
            {tab.grpcRequest.endpoint || 'Configure endpoint below'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-2)' }}>
            {tab.grpcRequest.serviceMethod || 'Select method'}
          </span>
          <button
            className="send-btn"
            style={{ background: 'var(--bg-3)', color: tab.dirty ? 'var(--text-accent)' : 'var(--text-2)', border: '1px solid var(--border)', minWidth: 'unset', padding: '2px 8px' }}
            onClick={handleSave}
            disabled={saving || !tab.dirty}
            title={tab.collectionId ? 'Save to collection (⌘S)' : 'Save to collection…'}
          >
            {saving ? '…' : '💾'}
          </button>
        </div>
        {showSavePicker && (
          <div style={{ padding: '6px 8px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-2)', flexShrink: 0 }}>Save to:</span>
            {collections.length === 0
              ? <span style={{ fontSize: 10, color: 'var(--text-2)' }}>No collections — create one first</span>
              : collections.map((col) => (
                <button key={col.id} style={{ fontSize: 10, padding: '1px 8px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-0)', cursor: 'pointer' }} onClick={() => void saveToCollection(col.id)}>
                  {col.name}
                </button>
              ))
            }
            <button style={{ marginLeft: 'auto', fontSize: 10, background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }} onClick={() => setShowSavePicker(false)}>✕</button>
          </div>
        )}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <GrpcPanel tab={tab} />
        </div>
      </div>
    )
  }

  return (
    <div className="request-editor" style={{ flex: '0 0 auto' }}>
      {/* URL bar */}
      <div className="url-bar">
        <select
          className="method-select"
          value={req.method}
          onChange={(e) => setHttpMethod(tab.id, e.target.value as HttpMethod)}
          style={{ color: `var(--method-${req.method})` }}
        >
          {METHODS.map((m) => <option key={m} value={m} style={{ color: 'var(--text-0)' }}>{m}</option>)}
        </select>
        <input
          className="url-input"
          placeholder="https://api.example.com/endpoint"
          value={req.url}
          onChange={(e) => setHttpUrl(tab.id, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
        />
        {tab.loading || sending
          ? <button className="send-btn cancel" onClick={cancel}>Cancel</button>
          : <button className="send-btn" onClick={send} disabled={!req.url}>Send</button>
        }
        <button
          className="send-btn"
          style={{ background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)', minWidth: 'unset', padding: '2px 8px' }}
          onClick={() => setShowCurlImport((v) => !v)}
          title="Import from cURL / export as cURL"
        >
          cURL
        </button>
        {req.url && (
          <button
            className="send-btn"
            style={{ background: 'var(--bg-3)', color: 'var(--text-2)', border: '1px solid var(--border)', minWidth: 'unset', padding: '2px 8px' }}
            onClick={() => void exportCurl()}
            title="Copy as cURL to clipboard"
          >
            ⎘
          </button>
        )}
        <button
          className="send-btn"
          style={{ background: 'var(--bg-3)', color: tab.dirty ? 'var(--text-accent)' : 'var(--text-2)', border: '1px solid var(--border)', minWidth: 'unset', padding: '2px 8px' }}
          onClick={handleSave}
          disabled={saving || !tab.dirty}
          title={tab.collectionId ? 'Save to collection (⌘S)' : 'Save to collection…'}
        >
          {saving ? '…' : '💾'}
        </button>
      </div>

      {/* Save-to-collection picker */}
      {showSavePicker && (
        <div style={{ padding: '6px 8px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-2)', flexShrink: 0 }}>Save to:</span>
          {collections.length === 0
            ? <span style={{ fontSize: 10, color: 'var(--text-2)' }}>No collections — create one first</span>
            : collections.map((col) => (
              <button
                key={col.id}
                style={{ fontSize: 10, padding: '1px 8px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-0)', cursor: 'pointer' }}
                onClick={() => void saveToCollection(col.id)}
              >
                {col.name}
              </button>
            ))
          }
          <button
            style={{ marginLeft: 'auto', fontSize: 10, background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }}
            onClick={() => setShowSavePicker(false)}
          >
            ✕
          </button>
        </div>
      )}

      {/* cURL import panel */}
      {showCurlImport && (
        <div style={{ padding: '6px 8px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            className="code-editor"
            style={{ minHeight: 48, fontSize: 10 }}
            placeholder="Paste curl command here…"
            value={curlInput}
            onChange={(e) => { setCurlInput(e.target.value); setCurlError(null) }}
            autoFocus
          />
          {curlError && <span style={{ fontSize: 10, color: 'var(--status-err)' }}>{curlError}</span>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ fontSize: 10, padding: '1px 10px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-0)', cursor: 'pointer' }} onClick={() => void importCurl()}>
              Import
            </button>
            <button style={{ fontSize: 10, padding: '1px 10px', background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer' }} onClick={() => { setShowCurlImport(false); setCurlError(null) }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inner tabs */}
      <div className="panel-tabs">
        {(['params', 'headers', 'body', 'auth'] as const).map((t) => (
          <div
            key={t}
            className={`panel-tab ${innerTab === t ? 'active' : ''}`}
            onClick={() => setInnerTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'params' && enabledParams > 0 && <span className="panel-tab-count">{enabledParams}</span>}
            {t === 'headers' && enabledHeaders > 0 && <span className="panel-tab-count">{enabledHeaders}</span>}
            {t === 'body' && req.body.mode !== 'none' && <span className="panel-tab-count">•</span>}
            {t === 'auth' && req.auth.type !== 'none' && <span className="panel-tab-count">•</span>}
          </div>
        ))}
      </div>

      <div className="panel-body" style={{ maxHeight: 240, overflow: 'auto' }}>
        {innerTab === 'params' && (
          <KvEditor
            rows={req.params}
            onChange={(rows) => setHttpParams(tab.id, rows)}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
          />
        )}

        {innerTab === 'headers' && (
          <KvEditor
            rows={req.headers}
            onChange={(rows) => setHttpHeaders(tab.id, rows)}
            keyPlaceholder="Header"
            valuePlaceholder="Value"
          />
        )}

        {innerTab === 'body' && (
          <BodyEditor tab={tab} />
        )}

        {innerTab === 'auth' && (
          <AuthEditor tab={tab} />
        )}
      </div>
    </div>
  )
}

function BodyEditor({ tab }: { tab: Tab }) {
  const { setHttpBody } = useStore()
  const body = tab.httpRequest.body

  return (
    <div>
      <select
        className="select"
        value={body.mode}
        onChange={(e) => setHttpBody(tab.id, { ...body, mode: e.target.value as typeof body.mode })}
        style={{ marginBottom: 10 }}
      >
        {['none', 'raw', 'json', 'urlencoded', 'form'].map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      {body.mode !== 'none' && body.mode !== 'form' && body.mode !== 'urlencoded' && (
        <textarea
          className="code-editor"
          style={{ minHeight: 140 }}
          placeholder={body.mode === 'json' ? '{\n  "key": "value"\n}' : 'Request body…'}
          value={body.raw ?? ''}
          onChange={(e) => setHttpBody(tab.id, { ...body, raw: e.target.value })}
        />
      )}

      {(body.mode === 'form' || body.mode === 'urlencoded') && (
        <KvEditor
          rows={body.formFields ?? []}
          onChange={(rows) => setHttpBody(tab.id, { ...body, formFields: rows })}
        />
      )}
    </div>
  )
}

function AuthEditor({ tab }: { tab: Tab }) {
  const { setHttpAuth } = useStore()
  const auth: AuthConfig = tab.httpRequest.auth

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <select className="select" value={auth.type} onChange={(e) => setHttpAuth(tab.id, { type: e.target.value } as AuthConfig)}>
          {['none', 'basic', 'bearer', 'apiKey'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {auth.type === 'basic' && (
        <>
          <input className="kv-input" placeholder="Username" value={auth.username} onChange={(e) => setHttpAuth(tab.id, { ...auth, username: e.target.value })} />
          <input className="kv-input" placeholder="Password" type="password" value={auth.password} onChange={(e) => setHttpAuth(tab.id, { ...auth, password: e.target.value })} />
        </>
      )}

      {auth.type === 'bearer' && (
        <input className="kv-input" placeholder="Bearer token" value={auth.token} onChange={(e) => setHttpAuth(tab.id, { ...auth, token: e.target.value })} />
      )}

      {auth.type === 'apiKey' && (
        <>
          <input className="kv-input" placeholder="Header / query key name" value={auth.key} onChange={(e) => setHttpAuth(tab.id, { ...auth, key: e.target.value })} />
          <input className="kv-input" placeholder="Value" value={auth.value} onChange={(e) => setHttpAuth(tab.id, { ...auth, value: e.target.value })} />
          <select className="select" value={auth.in} onChange={(e) => setHttpAuth(tab.id, { ...auth, in: e.target.value as 'header' | 'query' })}>
            <option value="header">Header</option>
            <option value="query">Query param</option>
          </select>
        </>
      )}
    </div>
  )
}
