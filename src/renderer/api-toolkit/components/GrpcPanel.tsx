/**
 * GrpcPanel — endpoint bar, proto source selector, method browser, message form, stream log.
 */

import { useState, useEffect } from 'react'
import { useStore } from '../store'
import type { Tab } from '../store'
import type { ProtoDiscovery, MessageSchema, GrpcMessage } from '../../../shared/api-toolkit-contracts'
import { ProtoFormEditor } from './ProtoFormEditor'

interface Props {
  tab: Tab
}

type SourceMode = 'text' | 'file' | 'reflection'

export function GrpcPanel({ tab }: Props) {
  const { setGrpcEndpoint, setGrpcServiceMethod, setGrpcMessageJson, setGrpcMetadata, setGrpcTls, setGrpcDiscovery, updateTab } = useStore()
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
    if (isStreaming) {
      if (active) {
        window.ananke.apiToolkit.grpc.streamCancel(tab.id)
        updateTab(tab.id, { grpcStreamActive: false, loading: false })
      } else {
        updateTab(tab.id, { grpcMessages: [], grpcStreamActive: true, loading: true, error: null })
        window.ananke.apiToolkit.grpc.streamStart(tab.id, { ...req, messageJson: tab.grpcRequest.messageJson })
      }
    } else {
      updateTab(tab.id, { loading: true, error: null, grpcResponse: null })
      window.ananke.apiToolkit.grpc.unary(req).then((resp) => {
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
      </div>

      {/* Proto source */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Proto source:</span>
          {(['text', 'file', 'reflection'] as SourceMode[]).map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: sourceMode === m ? 'var(--text-accent)' : 'var(--text-1)' }}>
              <input type="radio" value={m} checked={sourceMode === m} onChange={() => setSourceMode(m)} style={{ accentColor: 'var(--text-accent)' }} />
              {m === 'text' ? 'Paste text' : m === 'file' ? 'Upload files' : 'Server reflection'}
            </label>
          ))}
        </div>

        {sourceMode === 'text' && (
          <textarea
            className="code-editor"
            style={{ minHeight: 80, fontSize: 11, marginBottom: 6 }}
            placeholder={'syntax = "proto3";\n\nmessage HelloRequest { string name = 1; }'}
            value={protoText}
            onChange={(e) => setProtoText(e.target.value)}
          />
        )}

        {sourceMode === 'file' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="icon-btn" style={{ width: 'auto', padding: '0 10px', fontSize: 12 }} onClick={loadProtoFiles}>
              Browse .proto files
            </button>
            {protoFiles.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{protoFiles.length} file(s) loaded</span>
            )}
          </div>
        )}

        {sourceMode === 'reflection' && (
          <p style={{ fontSize: 11, color: 'var(--text-2)' }}>
            Schema will be fetched from server reflection at <code>{req.endpoint}</code>
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <button className="send-btn" style={{ fontSize: 12, padding: '3px 12px' }} onClick={discover} disabled={discovering}>
            {discovering ? 'Discovering…' : 'Discover services'}
          </button>
          {discovering && <div className="spinner" />}
          {discoverError && <span style={{ color: 'var(--status-err)', fontSize: 11 }}>{discoverError}</span>}
        </div>
      </div>

      {/* Method selector */}
      {discovery && discovery.services.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Method:</span>
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

      {/* Message form */}
      {req.serviceMethod && (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)', flex: 1 }}>
              {reqSchema ? reqSchema.fullName : 'Request message'}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text-2)' }}>
              <input type="checkbox" checked={jsonMode} onChange={(e) => setJsonMode(e.target.checked)} style={{ accentColor: 'var(--text-accent)' }} />
              Raw JSON
            </label>
            <button
              className="send-btn"
              disabled={!req.serviceMethod || tab.loading}
              onClick={send}
              style={{ padding: '3px 14px', fontSize: 12 }}
              title={isStreaming ? (active ? 'Stop stream' : 'Start stream') : 'Send'}
            >
              {tab.loading ? (active ? 'Stop' : '…') : isStreaming ? (active ? 'Stop' : 'Stream') : 'Send'}
            </button>
          </div>

          {jsonMode ? (
            <textarea
              className="code-editor"
              style={{ minHeight: 120 }}
              value={req.messageJson}
              onChange={(e) => setGrpcMessageJson(tab.id, e.target.value)}
            />
          ) : reqSchema ? (
            <ProtoFormEditor
              schema={reqSchema}
              value={formValue}
              onChange={setFormValue}
            />
          ) : (
            <textarea
              className="code-editor"
              style={{ minHeight: 120 }}
              value={req.messageJson}
              onChange={(e) => setGrpcMessageJson(tab.id, e.target.value)}
            />
          )}

          {/* Streaming send for client/bidi */}
          {isStreaming && active && (selectedMethod?.clientStreaming) && (
            <StreamSendBar tabId={tab.id} reqSchema={reqSchema} />
          )}
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
        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Send message</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text-2)' }}>
          <input type="checkbox" checked={jsonMode} onChange={(e) => setJsonMode(e.target.checked)} />
          JSON
        </label>
        <button className="send-btn" style={{ padding: '2px 12px', fontSize: 11 }} onClick={send}>Send</button>
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

export function StreamLog({ messages }: { messages: GrpcMessage[] }) {
  return (
    <div className="stream-log">
      {messages.length === 0 && (
        <div style={{ color: 'var(--text-2)', fontSize: 12, padding: '16px 0' }}>Waiting for messages…</div>
      )}
      {messages.map((msg, i) => (
        <div key={i} className={`stream-msg ${msg.direction}`}>
          <div className="stream-msg-meta">
            {msg.direction === 'recv' ? '↓ received' : '↑ sent'} · {new Date(msg.timestamp).toISOString().slice(11, 23)}
          </div>
          <pre style={{ margin: 0, fontSize: 11 }}>{msg.json}</pre>
        </div>
      ))}
    </div>
  )
}
