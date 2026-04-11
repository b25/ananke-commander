import { useState, useRef } from 'react'
import type { ApiToolkitPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'
import protobuf from 'protobufjs'

type Props = {
  pane: ApiToolkitPaneState
  isActive: boolean
  onClose: () => void
}

export function ApiToolkitPane({ pane, isActive, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'postman' | 'grpc'>('grpc')

  // Protobuf Decoder State
  const [protoSchemaName, setProtoSchemaName] = useState('')
  const [protoType, setProtoType] = useState('')
  const [availableTypes, setAvailableTypes] = useState<string[]>([])
  const [binaryFileName, setBinaryFileName] = useState('')
  const [decodedJson, setDecodedJson] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const protoRootRef = useRef<protobuf.Root | null>(null)

  const handleProtoSchemaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setProtoSchemaName(file.name)
    setErrorMsg('')
    setDecodedJson('')
    try {
      const text = await file.text()
      const parsed = protobuf.parse(text)
      protoRootRef.current = parsed.root
      const types = collectMessageTypes(parsed.root)
      setAvailableTypes(types)
      setProtoType(types[0] || '')
    } catch (err: unknown) {
      setErrorMsg(`Failed to parse .proto: ${(err as Error).message}`)
      protoRootRef.current = null
      setAvailableTypes([])
    }
  }

  const handleBinaryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBinaryFileName(file.name)
    setErrorMsg('')
    try {
      const root = protoRootRef.current
      if (!root) throw new Error('Please upload a .proto schema first.')
      if (!protoType) throw new Error('No message type selected.')
      const arrayBuf = await file.arrayBuffer()
      const buffer = new Uint8Array(arrayBuf)
      const MessageType = root.lookupType(protoType)
      const decoded = MessageType.decode(buffer)
      const obj = MessageType.toObject(decoded, { enums: String, longs: String, defaults: true })
      setDecodedJson(JSON.stringify(obj, null, 2))
    } catch (err: unknown) {
      setErrorMsg(`Failed to decode binary: ${(err as Error).message}`)
    }
  }

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title="API Toolkit" paneType="api-toolkit" onClose={onClose} />
      <div className="pane-body api-toolkit-body">
        <div className="api-toolkit-tabs">
          <button type="button" className={`api-toolkit-tab ${activeTab === 'grpc' ? 'active' : ''}`} onClick={() => setActiveTab('grpc')}>
            Proto / gRPC Decoder
          </button>
          <button type="button" className={`api-toolkit-tab ${activeTab === 'postman' ? 'active' : ''}`} onClick={() => setActiveTab('postman')}>
            Postman Import
          </button>
        </div>

        <div className="api-toolkit-content">
          {activeTab === 'postman' && (
            <div className="api-toolkit-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <h3>Postman Collection Import</h3>
              <p>Drag and drop a Postman collection.json to generate request macros.</p>
              <p className="muted">Coming soon</p>
            </div>
          )}

          {activeTab === 'grpc' && (
            <div className="api-toolkit-grpc">
              <div className="api-toolkit-section">
                <div className="api-toolkit-section-label">1. Upload .proto Schema</div>
                <div className="api-toolkit-upload-row">
                  <label className="api-toolkit-file-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Choose .proto
                    <input type="file" accept=".proto" onChange={handleProtoSchemaUpload} hidden />
                  </label>
                  {protoSchemaName && <span className="api-toolkit-file-name">{protoSchemaName}</span>}
                </div>
                {availableTypes.length > 0 && (
                  <div className="api-toolkit-type-row">
                    <label>Message Type:</label>
                    <select value={protoType} onChange={e => setProtoType(e.target.value)}>
                      {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="api-toolkit-section">
                <div className="api-toolkit-section-label">2. Upload Binary Payload</div>
                <div className="api-toolkit-upload-row">
                  <label className="api-toolkit-file-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Choose binary
                    <input type="file" accept=".bin,.dat,application/octet-stream" onChange={handleBinaryUpload} hidden />
                  </label>
                  {binaryFileName && <span className="api-toolkit-file-name">{binaryFileName}</span>}
                </div>
              </div>

              {errorMsg && <div className="api-toolkit-error">{errorMsg}</div>}

              {decodedJson && (
                <div className="api-toolkit-section api-toolkit-result">
                  <div className="api-toolkit-section-label">
                    Decoded JSON
                    <button type="button" className="notes-toolbar__btn" title="Copy" onClick={() => void window.ananke.clipboard.writeText(decodedJson)} style={{ marginLeft: 8 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                  </div>
                  <textarea className="api-toolkit-json" value={decodedJson} readOnly />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function collectMessageTypes(root: protobuf.Root, prefix = ''): string[] {
  const types: string[] = []
  for (const [name, obj] of Object.entries(root.nested || {})) {
    const fullName = prefix ? `${prefix}.${name}` : name
    if (obj instanceof protobuf.Type) {
      types.push(fullName)
    }
    if ('nested' in obj && obj.nested) {
      types.push(...collectMessageTypes(obj as unknown as protobuf.Root, fullName))
    }
  }
  return types
}
