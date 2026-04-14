/**
 * GrpcPanel — endpoint bar, proto source selector, method browser, message form, stream log.
 */

import { useState, useEffect } from 'react'
import { useStore } from '../store'
import type { Tab } from '../store'
import type { ProtoDiscovery, MessageSchema, GrpcMessage } from '../../../shared/api-toolkit-contracts'
import { ProtoFormEditor } from './ProtoFormEditor'
import { KvEditor } from './KvEditor'
import { applyVarsToGrpcRequest } from '../lib/substituteVars'

interface Props {
  tab: Tab
}

type SourceMode = 'text' | 'file' | 'reflection'

export function GrpcPanel({ tab }: Props) {
  const { setGrpcEndpoint, setGrpcServiceMethod, setGrpcMessageJson, setGrpcMetadata, setGrpcTls, setGrpcDiscovery, updateTab, environments, activeEnvironmentId } = useStore()
  const req = tab.grpcRequest
  const [sourceMode, setSourceMode] = useState<SourceMode>((req.protoSource.type as SourceMode) ?? 'text')
  const [protoText, setProtoText] = useState(req.protoSource.type === 'text' ? req.protoSource.content : '')
  const [protoFiles, setProtoFiles] = useState<Array<{ name: string; content: string }>>([])
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [formValue, setFormValue] = useState<Record<string, unknown>>({})
  const [jsonMode, setJsonMode] = useState(false)

  const discovery = tab.grpcDiscovery
  const selectedMethod = discovery?.services
    .flatMap((s) => s.methods)
    .find((m) => m.fullName === req.serviceMethod || `${m.fullName.split('/')[0]}/${m.name}` === req.serviceMethod)

  const reqSchema: MessageSchema | null = selectedMethod && discovery
    ? discovery.schemas[selectedMethod.requestType] ?? null
    : null

  const isStreaming = selectedMethod ? (selectedMethod.clientStreaming || selectedMethod.serverStreaming) : false
  const active = tab.grpcStreamActive

  // Sync JSON when form changes
  useEffect(() => {
    if (!jsonMode) {
      setGrpcMessageJson(tab.id, JSON.stringify(formValue, null, 2))
    }
  }, [formValue, jsonMode, tab.id])

  async function discover() {
    setDiscoverError(null)
    setDiscovering(true)
    let source = req.protoSource
    if (sourceMode === 'text') source = { type: 'text', content: protoText }
    if (sourceMode === 'reflection') source = { type: 'reflection' }
    if (sourceMode === 'file') source = { type: 'file', files: protoFiles, entryFile: protoFiles[0]?.name ?? '' }

    try {
      const result: ProtoDiscovery = await window.ananke.apiToolkit.grpc.discover({ ...req, protoSource: source })
      setGrpcDiscovery(tab.id, result)
      updateTab(tab.id, { grpcRequest: { ...req, protoSource: source } })
    } catch (e) {
      setDiscoverError(String(e))
    } finally {
      setDiscovering(false)
    }
  }

  async function loadProtoFiles() {
    const files = await window.ananke.apiToolkit.dialog.openProto()
    if (!files) return
    setProtoFiles(files)
  }

  function send() {
    const activeVars = environments.find((e) => e.id === activeEnvironmentId)?.variables.filter((v) => v.enabled) ?? []
    const resolvedReq = applyVarsToGrpcRequest(req, activeVars)
    if (isStreaming) {
      if (active) {
        window.ananke.apiToolkit.grpc.streamCancel(tab.id)
        updateTab(tab.id, { grpcStreamActive: false, loading: false })
      } else {
        updateTab(tab.id, { grpcMessages: [], grpcStreamActive: true, loading: true, error: null })
        window.ananke.apiToolkit.grpc.streamStart(tab.id, { ...resolvedReq, messageJson: tab.grpcRequest.messageJson })
      }
    } else {
      updateTab(tab.id, { loading: true, error: null, grpcResponse: null })
      window.ananke.apiToolkit.grpc.unary(resolvedReq).then((resp) => {
        updateTab(tab.id, { grpcResponse: resp, loading: false })
      }).catch((e: unknown) => {
        updateTab(tab.id, { error: String(e), loading: false })
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Endpoint bar */}
      <div className="grpc-endpoint-bar">
        <input
          className="grpc-endpoint-input"
          placeholder="host:port"
          value={req.endpoint}
          onChange={(e) => setGrpcEndpoint(tab.id, e.target.value)}
        />
        <select
          className="select"
          value={req.tls.mode}
          onChange={(e) => setGrpcTls(tab.id, { ...req.tls, mode: e.target.value as 'none' | 'tls' | 'mtls' })}
          title="TLS mode"
        >
          <option value="none">Plaintext</option>
          <option value="tls">TLS</option>
          <option value="mtls">mTLS</option>
        </select>
        <input
          type="number"
          className="kv-input"
          style={{ width: 72, fontSize: 10 }}
          placeholder="Deadline ms"
          title="Deadline (ms, 0 = none)"
          value={req.deadline ?? 0}
          min={0}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10)
            updateTab(tab.id, { grpcRequest: { ...req, deadline: isNaN(val) ? 0 : val }, dirty: true })
          }}
        />
      </div>

      {/* TLS cert paths (shown when tls or mtls) */}
      {req.tls.mode !== 'none' && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <TlsCertRow label="CA cert" value={req.tls.caCert ?? ''} onChange={(v) => setGrpcTls(tab.id, { ...req.tls, caCert: v })} />
          {req.tls.mode === 'mtls' && (
            <>
              <TlsCertRow label="Client cert" value={req.tls.clientCert ?? ''} onChange={(v) => setGrpcTls(tab.id, { ...req.tls, clientCert: v })} />
              <TlsCertRow label="Client key" value={req.tls.clientKey ?? ''} onChange={(v) => setGrpcTls(tab.id, { ...req.tls, clientKey: v })} />
            </>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={req.tls.insecure ?? false}
              onChange={(e) => setGrpcTls(tab.id, { ...req.tls, insecure: e.target.checked })}
              style={{ accentColor: 'var(--text-accent)' }}
            />
            Skip certificate verification
          </label>
        </div>
      )}

      {/* Proto source */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-2)' }}>Proto source:</span>
          {(['text', 'file', 'reflection'] as SourceMode[]).map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 10, color: sourceMode === m ? 'var(--text-accent)' : 'var(--text-1)' }}>
              <input type="radio" value={m} checked={sourceMode === m} onChange={() => setSourceMode(m)} style={{ accentColor: 'var(--text-accent)' }} />
              {m === 'text' ? 'Paste text' : m === 'file' ? 'Upload files' : 'Server reflection'}
            </label>
          ))}
        </div>

        {sourceMode === 'text' && (
          <textarea
            className="code-editor"
            style={{ minHeight: 80, fontSize: 10, marginBottom: 6 }}
            placeholder={'syntax = "proto3";\n\nmessage HelloRequest { string name = 1; }'}
            value={protoText}
            onChange={(e) => setProtoText(e.target.value)}
          />
        )}

        {sourceMode === 'file' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="icon-btn" style={{ width: 'auto', padding: '0 10px', fontSize: 10 }} onClick={loadProtoFiles}>
              Browse .proto files
            </button>
            {protoFiles.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{protoFiles.length} file(s) loaded</span>
            )}
          </div>
        )}

        {sourceMode === 'reflection' && (
          <p style={{ fontSize: 10, color: 'var(--text-2)' }}>
            Schema will be fetched from server reflection at <code>{req.endpoint}</code>
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <button className="send-btn" style={{ fontSize: 10, padding: '3px 12px' }} onClick={discover} disabled={discovering}>
            {discovering ? 'Discovering…' : 'Discover services'}
          </button>
          {discovering && <div className="spinner" />}
          {discoverError && <span style={{ color: 'var(--status-err)', fontSize: 10 }}>{discoverError}</span>}
        </div>
      </div>

      {/* Method selector */}
      {discovery && discovery.services.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-2)' }}>Method:</span>
          <select
            className="grpc-method-select"
            value={req.serviceMethod}
            onChange={(e) => setGrpcServiceMethod(tab.id, e.target.value)}
          >
            <option value="">— select —</option>
            {discovery.services.map((svc) =>
              svc.methods.map((m) => (
                <option key={m.fullName} value={m.fullName}>
                  {svc.name} / {m.name}
                  {m.clientStreaming && m.serverStreaming ? ' (bidi)' : m.clientStreaming ? ' (client stream)' : m.serverStreaming ? ' (server stream)' : ''}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      {/* Message / Metadata tabs */}
      {req.serviceMethod && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="panel-tabs" style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`panel-tab ${!jsonMode ? 'active' : ''}`} onClick={() => setJsonMode(false)}>
              Message {reqSchema ? `(${reqSchema.fullName.split('.').pop()})` : ''}
            </div>
            <div className={`panel-tab ${jsonMode ? 'active' : ''}`} onClick={() => setJsonMode(true)}>
              JSON
            </div>
            <div className="panel-tab" style={{ marginLeft: 'auto', color: 'var(--text-2)', cursor: 'default' }} />
            <button
              className="send-btn"
              disabled={!req.serviceMethod || tab.loading}
              onClick={send}
              style={{ padding: '2px 12px', fontSize: 10, margin: '0 8px' }}
              title={isStreaming ? (active ? 'Stop stream' : 'Start stream') : 'Send'}
            >
              {tab.loading ? (active ? 'Stop' : '…') : isStreaming ? (active ? 'Stop' : 'Stream') : 'Send'}
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            {jsonMode ? (
              <textarea
                className="code-editor"
                style={{ minHeight: 120 }}
                value={req.messageJson}
                onChange={(e) => setGrpcMessageJson(tab.id, e.target.value)}
              />
            ) : reqSchema ? (
              <ProtoFormEditor schema={reqSchema} value={formValue} onChange={setFormValue} />
            ) : (
              <textarea
                className="code-editor"
                style={{ minHeight: 120 }}
                value={req.messageJson}
                onChange={(e) => setGrpcMessageJson(tab.id, e.target.value)}
              />
            )}
            {isStreaming && active && selectedMethod?.clientStreaming && (
              <StreamSendBar tabId={tab.id} reqSchema={reqSchema} />
            )}
          </div>
          {/* Metadata section */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '6px 12px', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Metadata {req.metadata.filter(m => m.enabled && m.key).length > 0 && `(${req.metadata.filter(m => m.enabled && m.key).length})`}
            </div>
            <KvEditor
              rows={req.metadata.length ? req.metadata : [{ key: '', value: '', enabled: true }]}
              onChange={(rows) => setGrpcMetadata(tab.id, rows)}
              keyPlaceholder="Metadata key"
              valuePlaceholder="Value"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function StreamSendBar({ tabId, reqSchema }: { tabId: string; reqSchema: MessageSchema | null }) {
  const [json, setJson] = useState('{}')
  const [formVal, setFormVal] = useState<Record<string, unknown>>({})
  const [jsonMode, setJsonMode] = useState(false)

  function send() {
    const msg = jsonMode ? json : JSON.stringify(formVal, null, 2)
    window.ananke.apiToolkit.grpc.streamSend(tabId, msg)
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-2)' }}>Send message</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, cursor: 'pointer', color: 'var(--text-2)' }}>
          <input type="checkbox" checked={jsonMode} onChange={(e) => setJsonMode(e.target.checked)} />
          JSON
        </label>
        <button className="send-btn" style={{ padding: '2px 12px', fontSize: 10 }} onClick={send}>Send</button>
      </div>
      {jsonMode ? (
        <textarea className="code-editor" style={{ minHeight: 60 }} value={json} onChange={(e) => setJson(e.target.value)} />
      ) : reqSchema ? (
        <ProtoFormEditor schema={reqSchema} value={formVal} onChange={setFormVal} />
      ) : (
        <textarea className="code-editor" style={{ minHeight: 60 }} value={json} onChange={(e) => setJson(e.target.value)} />
      )}
    </div>
  )
}

function TlsCertRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  async function browse() {
    const content = await window.ananke.apiToolkit.dialog.openFile()
    if (content !== null) onChange(content)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-2)', width: 72, flexShrink: 0 }}>{label}</span>
      <input
        className="kv-input"
        style={{ flex: 1, fontSize: 10 }}
        placeholder={`Paste PEM or browse…`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className="icon-btn"
        style={{ width: 'auto', padding: '0 8px', fontSize: 10, flexShrink: 0 }}
        title={`Browse for ${label} file`}
        onClick={() => void browse()}
      >
        Browse
      </button>
    </div>
  )
}

export function StreamLog({ messages }: { messages: GrpcMessage[] }) {
  return (
    <div className="stream-log">
      {messages.length === 0 && (
        <div style={{ color: 'var(--text-2)', fontSize: 10, padding: '16px 0' }}>Waiting for messages…</div>
      )}
      {messages.map((msg, i) => (
        <div key={i} className={`stream-msg ${msg.direction}`}>
          <div className="stream-msg-meta">
            {msg.direction === 'recv' ? '↓ received' : '↑ sent'} · {new Date(msg.timestamp).toISOString().slice(11, 23)}
          </div>
          <pre style={{ margin: 0, fontSize: 10 }}>{msg.json}</pre>
        </div>
      ))}
    </div>
  )
}
