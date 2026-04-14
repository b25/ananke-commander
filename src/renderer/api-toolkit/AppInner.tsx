import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore, useActiveTab } from './store'
import type { Tab } from './store'
import { Sidebar } from './components/Sidebar'
import { RequestEditor } from './components/RequestEditor'
import { ResponseViewer } from './components/ResponseViewer'
import { ErrorBoundary } from './components/ErrorBoundary'

export function App() {
  const { tabs, activeTabId, openTab, closeTab, setActiveTab, setCollections, setEnvironments, setHistory, addHistoryEntry } = useStore()
  const activeTab = useActiveTab()
  const initialized = useRef(false)

  // Load persisted data on mount
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    window.ananke.apiToolkit.storage.getCollections().then(setCollections).catch(console.error)
    window.ananke.apiToolkit.storage.getEnvironments().then(setEnvironments).catch(console.error)
    window.ananke.apiToolkit.storage.getHistory().then(setHistory).catch(console.error)
    window.ananke.apiToolkit.mock.getData().then(useStore.getState().setMockData).catch(console.error)

    // Bootstrap active tab if none
    if (!activeTabId && tabs.length > 0) {
      setActiveTab(tabs[0].id)
    }
  }, [])

  // Wire up mock server hit events
  useEffect(() => {
    const off = window.ananke.apiToolkit.mock.onRouteHit((routeId, hitCount) => {
      useStore.getState().updateRouteHitCount(routeId, hitCount)
    })
    return () => { off() }
  }, [])

  // Wire up gRPC stream IPC events
  useEffect(() => {
    const off1 = window.ananke.apiToolkit.grpc.onStreamMessage((streamId, msg) => {
      useStore.getState().addGrpcStreamMessage(streamId, msg)
    })
    const off2 = window.ananke.apiToolkit.grpc.onStreamEnd((streamId, status, trailers) => {
      useStore.getState().endGrpcStream(streamId, status, trailers)
      // Persist to history
      const tab = useStore.getState().tabs.find((t) => t.id === streamId)
      if (tab) {
        addHistoryEntry({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          protocol: 'grpc',
          name: tab.grpcRequest.serviceMethod || 'gRPC call',
          grpcRequest: tab.grpcRequest,
          grpcResponse: tab.grpcResponse ?? undefined,
          duration: 0,
        })
      }
    })
    const off3 = window.ananke.apiToolkit.grpc.onStreamError((streamId, err) => {
      useStore.getState().updateTab(streamId, { error: err, loading: false, grpcStreamActive: false })
    })
    return () => { off1(); off2(); off3() }
  }, [])

  const effectiveTabId = activeTabId ?? tabs[0]?.id

  return (
    <div className="app-root">
      {/* Sidebar */}
      <ErrorBoundary label="Sidebar">
        <Sidebar />
      </ErrorBoundary>

      {/* Main area */}
      <div className="main-area">
        {/* Tab bar */}
        <TabBar
          tabs={tabs}
          activeTabId={effectiveTabId}
          onSelect={setActiveTab}
          onClose={closeTab}
          onNew={() => openTab()}
        />

        {/* Request + response split (resizable) */}
        {activeTab ? (
          <ErrorBoundary label="Request/Response">
            <ResizableSplit tab={activeTab} />
          </ErrorBoundary>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">⚡</div>
            <span>Open a request or create a new one</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ResizableSplit({ tab }: { tab: Tab }) {
  const [requestPct, setRequestPct] = useState(45)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    function onMove(ev: MouseEvent) {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((ev.clientY - rect.top) / rect.height) * 100
      setRequestPct(Math.min(80, Math.max(15, pct)))
    }

    function onUp() {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: `${requestPct}%`, overflow: 'hidden', flexShrink: 0 }}>
        <ErrorBoundary label="Request Editor">
          <RequestEditor tab={tab} />
        </ErrorBoundary>
      </div>
      <div
        style={{ height: 4, cursor: 'row-resize', background: 'var(--border)', flexShrink: 0, userSelect: 'none' }}
        onMouseDown={onMouseDown}
        title="Drag to resize"
      />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ErrorBoundary label="Response Viewer">
          <ResponseViewer key={tab.id} tab={tab} />
        </ErrorBoundary>
      </div>
    </div>
  )
}

function TabBar({ tabs, activeTabId, onSelect, onClose, onNew }: {
  tabs: Tab[]
  activeTabId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}) {
  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.protocol === 'grpc' && <span className="method-badge method-grpc" style={{ fontSize: 9 }}>gRPC</span>}
          {tab.protocol === 'http' && tab.httpRequest.method && (
            <span className={`method-badge method-${tab.httpRequest.method}`} style={{ fontSize: 9 }}>
              {tab.httpRequest.method}
            </span>
          )}
          <span className="tab-name" title={tab.name}>{tab.name}</span>
          {tab.dirty && <span style={{ fontSize: 9, color: 'var(--text-2)' }}>●</span>}
          <span className="tab-close" onClick={(e) => {
            e.stopPropagation()
            if (tab.dirty && tab.collectionId) {
              if (!window.confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) return
            }
            onClose(tab.id)
          }}>×</span>
        </div>
      ))}
      <div className="tab-new-btn" onClick={onNew} title="New request">+</div>
    </div>
  )
}

export function ProtocolToggle() {
  const activeTab = useActiveTab()
  const { updateTab } = useStore()

  if (!activeTab) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)', padding: '2px' }}>
      {(['http', 'grpc'] as const).map((p) => (
        <button
          key={p}
          style={{
            background: activeTab.protocol === p ? 'var(--bg-4)' : 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: activeTab.protocol === p ? 'var(--text-0)' : 'var(--text-2)',
            padding: '3px 10px',
            fontSize: 10,
            cursor: 'pointer',
            fontWeight: activeTab.protocol === p ? 600 : 400,
          }}
          onClick={() => updateTab(activeTab.id, { protocol: p })}
        >
          {p.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
