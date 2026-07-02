import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import type { Tab } from '../store'
import type { HttpMethod, AuthConfig, MultipartPart } from '../../../shared/api-toolkit-contracts'
import { KvEditor } from './KvEditor'
import { GrpcPanel } from './GrpcPanel'
import { PanelTabStrip } from './PanelTabStrip'
import { SaveToCollectionPicker } from './SaveToCollectionPicker'
import { applyVarsToHttpRequest } from '../lib/substituteVars'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']

interface Props {
  tab: Tab
}

export function RequestEditor({ tab }: Props) {
  const { setHttpMethod, setHttpUrl, setHttpParams, setHttpHeaders, setHttpBody, setHttpAuth, updateTab, saveTabToCollection, collections, addItemToCollection, environments, activeEnvironmentId, addHistoryEntry } = useStore(
    useShallow((s) => ({
      setHttpMethod: s.setHttpMethod,
      setHttpUrl: s.setHttpUrl,
      setHttpParams: s.setHttpParams,
      setHttpHeaders: s.setHttpHeaders,
      setHttpBody: s.setHttpBody,
      setHttpAuth: s.setHttpAuth,
      updateTab: s.updateTab,
      saveTabToCollection: s.saveTabToCollection,
      collections: s.collections,
      addItemToCollection: s.addItemToCollection,
      environments: s.environments,
      activeEnvironmentId: s.activeEnvironmentId,
      addHistoryEntry: s.addHistoryEntry,
    }))
  )
  const req = tab.httpRequest
  const [innerTab, setInnerTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showSavePicker, setShowSavePicker] = useState(false)
  const [showCurlImport, setShowCurlImport] = useState(false)
  const [curlInput, setCurlInput] = useState('')
  const [curlError, setCurlError] = useState<string | null>(null)

  // Ref pointing to this editor's root container div — used to scope the keyboard
  // shortcut listener so only the pane that contains the focused element responds.
  // Events from inputs/buttons inside this container bubble up to containerRef.current;
  // events from a SECOND mounted editor instance do not cross container boundaries,
  // preventing ⌘Enter/⌘S from firing twice when two API-toolkit panes are open (CORR-10).
  const containerRef = useRef<HTMLDivElement>(null)

  // Ref that always holds the latest handlers + guards for the keyboard-shortcut listener.
  // Updated synchronously on every render so the effect (registered once with deps=[])
  // never captures stale request/tab state — fixes the CORR-3 stale-closure bug where
  // edits to headers, body, params, or auth were invisible to the ⌘Enter handler.
  // send/handleSave are hoisted function declarations so referencing them here is safe.
  const kbRef = useRef<{
    protocol: string
    sending: boolean
    url: string
    send: () => Promise<void>
    handleSave: () => Promise<void>
  } | null>(null)
  kbRef.current = { protocol: tab.protocol, sending, url: req.url, send, handleSave }

  // Cmd+S / Ctrl+S to save; Cmd+Enter / Ctrl+Enter to send.
  // Listener is attached to the editor's own container div (not window) so only the
  // pane whose DOM subtree contains the focused element handles the shortcut.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      const cur = kbRef.current
      if (!cur) return
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void cur.handleSave()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (cur.protocol === 'http' && !cur.sending && cur.url) void cur.send()
      }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, []) // Stable: registered once per mount; always reads fresh state via kbRef.

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
      const entry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        protocol: 'http' as const,
        name: req.url || 'Request',
        httpRequest: resolvedReq,
        httpResponse: resp,
        duration: resp.timings.total,
      }
      addHistoryEntry(entry)
      void window.ananke.apiToolkit.storage.addHistory(entry)
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
      <div ref={containerRef} className="request-editor" style={{ flex: '0 0 auto', maxHeight: '50%', overflow: 'hidden' }}>
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
          <SaveToCollectionPicker
            collections={collections}
            onPick={(colId) => void saveToCollection(colId)}
            onDismiss={() => setShowSavePicker(false)}
          />
        )}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <GrpcPanel tab={tab} />
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="request-editor" style={{ flex: '0 0 auto' }}>
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
        <SaveToCollectionPicker
          collections={collections}
          onPick={(colId) => void saveToCollection(colId)}
          onDismiss={() => setShowSavePicker(false)}
        />
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

      <PanelTabStrip
        activeId={innerTab}
        onSelect={(id) => setInnerTab(id as typeof innerTab)}
        tabs={(['params', 'headers', 'body', 'auth'] as const).map((t) => ({
          id: t,
          label: (
            <>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'params' && enabledParams > 0 && <span className="panel-tab-count">{enabledParams}</span>}
              {t === 'headers' && enabledHeaders > 0 && <span className="panel-tab-count">{enabledHeaders}</span>}
              {t === 'body' && req.body.mode !== 'none' && <span className="panel-tab-count">•</span>}
              {t === 'auth' && req.auth.type !== 'none' && <span className="panel-tab-count">•</span>}
            </>
          )
        }))}
      />

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
  const setHttpBody = useStore((s) => s.setHttpBody)
  const body = tab.httpRequest.body

  async function pickBinaryFile() {
    const result = await window.ananke.apiToolkit.dialog.openFilePath()
    if (result) {
      setHttpBody(tab.id, { ...body, mode: 'binary', filePath: result.path })
    }
  }

  function addMultipartTextRow() {
    const newPart: MultipartPart = { key: '', kind: 'text', value: '', enabled: true }
    setHttpBody(tab.id, { ...body, parts: [...(body.parts ?? []), newPart] })
  }

  async function pickMultipartFile(idx: number) {
    const result = await window.ananke.apiToolkit.dialog.openFilePath()
    if (result) {
      const parts = [...(body.parts ?? [])]
      parts[idx] = { key: parts[idx]?.key ?? '', kind: 'file', filePath: result.path, enabled: parts[idx]?.enabled ?? true }
      setHttpBody(tab.id, { ...body, parts })
    }
  }

  function updateMultipartPart(idx: number, patch: Partial<MultipartPart>) {
    const parts = (body.parts ?? []).map((p, i) => i === idx ? { ...p, ...patch } as MultipartPart : p)
    setHttpBody(tab.id, { ...body, parts })
  }

  function removeMultipartPart(idx: number) {
    const parts = (body.parts ?? []).filter((_, i) => i !== idx)
    setHttpBody(tab.id, { ...body, parts })
  }

  function toggleMultipartKind(idx: number) {
    const p = (body.parts ?? [])[idx]
    if (!p) return
    if (p.kind === 'text') {
      const updated: MultipartPart = { key: p.key, kind: 'file', filePath: '', enabled: p.enabled }
      updateMultipartPart(idx, updated)
    } else {
      const updated: MultipartPart = { key: p.key, kind: 'text', value: '', enabled: p.enabled }
      updateMultipartPart(idx, updated)
    }
  }

  const isTextOrRaw = body.mode !== 'none' && body.mode !== 'form' && body.mode !== 'urlencoded' && body.mode !== 'binary' && body.mode !== 'multipart'

  return (
    <div>
      <select
        className="atk-select"
        value={body.mode}
        onChange={(e) => setHttpBody(tab.id, { ...body, mode: e.target.value as typeof body.mode })}
        style={{ marginBottom: 10 }}
      >
        {['none', 'raw', 'json', 'urlencoded', 'form', 'binary', 'multipart'].map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      {isTextOrRaw && (
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

      {body.mode === 'binary' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
          <button
            className="send-btn"
            style={{ background: 'var(--bg-3)', color: 'var(--text-0)', border: '1px solid var(--border)', fontSize: 11 }}
            onClick={() => void pickBinaryFile()}
          >
            Choose file…
          </button>
          <span style={{ fontSize: 11, color: body.filePath ? 'var(--text-0)' : 'var(--text-2)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {body.filePath ? body.filePath.split('/').pop() ?? body.filePath : 'No file selected'}
          </span>
          {body.filePath && (
            <button
              title="Clear file"
              style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}
              onClick={() => setHttpBody(tab.id, { ...body, filePath: undefined })}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {body.mode === 'multipart' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(body.parts ?? []).map((p, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                className="kv-input"
                style={{ width: 90, flexShrink: 0 }}
                placeholder="Key"
                value={p.key}
                onChange={(e) => updateMultipartPart(idx, { key: e.target.value } as Partial<MultipartPart>)}
              />
              <button
                title={`Switch to ${p.kind === 'text' ? 'file' : 'text'}`}
                style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-2)', borderRadius: 'var(--radius-sm)', fontSize: 10, padding: '1px 6px', cursor: 'pointer', flexShrink: 0 }}
                onClick={() => toggleMultipartKind(idx)}
              >
                {p.kind === 'text' ? 'text' : 'file'}
              </button>
              {p.kind === 'text'
                ? (
                  <input
                    className="kv-input"
                    style={{ flex: 1 }}
                    placeholder="Value"
                    value={p.value}
                    onChange={(e) => updateMultipartPart(idx, { value: e.target.value } as Partial<MultipartPart>)}
                  />
                )
                : (
                  <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center', overflow: 'hidden' }}>
                    <button
                      className="send-btn"
                      style={{ background: 'var(--bg-3)', color: 'var(--text-0)', border: '1px solid var(--border)', fontSize: 10, flexShrink: 0 }}
                      onClick={() => void pickMultipartFile(idx)}
                    >
                      Choose…
                    </button>
                    <span style={{ fontSize: 10, color: p.filePath ? 'var(--text-0)' : 'var(--text-2)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.filePath ? p.filePath.split('/').pop() ?? p.filePath : 'No file'}
                    </span>
                  </div>
                )
              }
              <input
                type="checkbox"
                title="Enabled"
                checked={p.enabled}
                onChange={(e) => updateMultipartPart(idx, { enabled: e.target.checked } as Partial<MultipartPart>)}
                style={{ flexShrink: 0 }}
              />
              <button
                title="Remove row"
                style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                onClick={() => removeMultipartPart(idx)}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            style={{ alignSelf: 'flex-start', fontSize: 10, padding: '1px 8px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-0)', cursor: 'pointer', marginTop: 2 }}
            onClick={addMultipartTextRow}
          >
            + Add field
          </button>
        </div>
      )}
    </div>
  )
}

function AuthEditor({ tab }: { tab: Tab }) {
  const setHttpAuth = useStore((s) => s.setHttpAuth)
  const auth: AuthConfig = tab.httpRequest.auth

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <select className="atk-select" value={auth.type} onChange={(e) => {
          const t = e.target.value
          const defaults: AuthConfig =
            t === 'basic'  ? { type: 'basic',  username: '', password: '' } :
            t === 'bearer' ? { type: 'bearer', token: '' } :
            t === 'apiKey' ? { type: 'apiKey', key: '', value: '', in: 'header' } :
            { type: 'none' }
          setHttpAuth(tab.id, defaults)
        }}>
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
          <select className="atk-select" value={auth.in} onChange={(e) => setHttpAuth(tab.id, { ...auth, in: e.target.value as 'header' | 'query' })}>
            <option value="header">Header</option>
            <option value="query">Query param</option>
          </select>
        </>
      )}
    </div>
  )
}
