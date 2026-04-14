import { useState } from 'react'
import { useStore } from '../store'
import type { MockRoute } from '../../../shared/api-toolkit-contracts'
import { MockRouteEditor } from './MockRouteEditor'

export function MockProxyPanel() {
  const {
    mockData, mockRunning, mockActualPort,
    saveMockData, startMock, stopMock,
  } = useStore()

  const [portInput, setPortInput] = useState(String(mockData.port))
  const [startError, setStartError] = useState('')
  const [starting, setStarting] = useState(false)
  const [editingRoute, setEditingRoute] = useState<MockRoute | null | 'new'>(null)

  async function handleStartStop() {
    setStartError('')
    if (mockRunning) {
      await stopMock()
      return
    }
    const port = Number(portInput)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setStartError('Port must be 1–65535')
      return
    }
    // Save port if changed
    const data = { ...mockData, port }
    if (port !== mockData.port) await saveMockData(data)
    setStarting(true)
    try {
      // Ensure store has latest port before starting
      useStore.getState().setMockData(data)
      await startMock()
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  async function handleSaveRoute(route: MockRoute) {
    const routes = editingRoute === 'new'
      ? [...mockData.routes, route]
      : mockData.routes.map((r) => r.id === route.id ? route : r)
    await saveMockData({ ...mockData, routes })
    setEditingRoute(null)
  }

  async function handleDelete(id: string) {
    await saveMockData({ ...mockData, routes: mockData.routes.filter((r) => r.id !== id) })
  }

  async function handleToggle(id: string) {
    const routes = mockData.routes.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r)
    await saveMockData({ ...mockData, routes })
  }

  if (editingRoute !== null) {
    return (
      <MockRouteEditor
        route={editingRoute === 'new' ? undefined : editingRoute}
        onSave={handleSaveRoute}
        onCancel={() => setEditingRoute(null)}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Server control bar */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-0)' }}>Mock Proxy Server</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-2)' }}>Port</span>
          <input
            style={{
              width: 64, background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-0)', fontSize: 11,
              padding: '3px 6px', outline: 'none',
            }}
            value={portInput}
            disabled={mockRunning}
            onChange={(e) => setPortInput(e.target.value)}
          />
          <button
            style={{
              fontSize: 10, padding: '3px 12px', cursor: starting ? 'default' : 'pointer',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: mockRunning ? 'var(--bg-3)' : 'var(--text-accent)',
              color: mockRunning ? 'var(--text-1)' : 'var(--bg-0)',
              opacity: starting ? 0.6 : 1,
            }}
            disabled={starting}
            onClick={handleStartStop}
          >
            {starting ? 'Starting…' : mockRunning ? 'Stop' : 'Start'}
          </button>
          {mockRunning && mockActualPort && (
            <span style={{ fontSize: 10, color: 'var(--method-get)', fontFamily: 'var(--font-mono)' }}>
              Running on :{mockActualPort}
            </span>
          )}
          {!mockRunning && (
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Stopped</span>
          )}
        </div>
        {startError && (
          <div className="error-box" style={{ fontSize: 10, padding: '3px 8px' }}>{startError}</div>
        )}
      </div>

      {/* Route list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Routes ({mockData.routes.length})
          </span>
          <button
            style={{ fontSize: 10, padding: '2px 10px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-1)', cursor: 'pointer' }}
            onClick={() => setEditingRoute('new')}
          >
            + Add Route
          </button>
        </div>

        {mockData.routes.length === 0 && (
          <div className="empty-state" style={{ padding: 24 }}>
            <div className="empty-state-icon">⊘</div>
            <span>No mock routes yet</span>
          </div>
        )}

        {mockData.routes.map((route) => (
          <RouteRow
            key={route.id}
            route={route}
            onEdit={() => setEditingRoute(route)}
            onToggle={() => handleToggle(route.id)}
            onDelete={() => handleDelete(route.id)}
          />
        ))}
      </div>
    </div>
  )
}

function RouteRow({ route, onEdit, onToggle, onDelete }: {
  route: MockRoute
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const statusClass = `status-${Math.floor(route.statusCode / 100)}xx`
  const methodKey = route.method === '*' ? 'ANY' : route.method

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
        borderBottom: '1px solid var(--border)', cursor: 'pointer',
        opacity: route.enabled ? 1 : 0.45,
        background: 'transparent',
      }}
      onClick={onEdit}
    >
      <span
        className={`method-badge method-${route.method === '*' ? 'GET' : route.method}`}
        style={{ fontSize: 8, minWidth: 32, textAlign: 'center', opacity: route.method === '*' ? 0.7 : 1 }}
      >
        {methodKey}
      </span>
      <span style={{ flex: 1, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {route.urlPattern}
      </span>
      <span className={`status-pill ${statusClass}`} style={{ fontSize: 9, padding: '1px 5px' }}>
        {route.statusCode}
      </span>
      {route.hitCount > 0 && (
        <span style={{ fontSize: 9, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', minWidth: 28 }}>
          {route.hitCount}×
        </span>
      )}
      {route.delay > 0 && (
        <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {route.delay}ms
        </span>
      )}
      <button
        style={iconBtnStyle}
        title={route.enabled ? 'Disable' : 'Enable'}
        onClick={(e) => { e.stopPropagation(); onToggle() }}
      >
        {route.enabled ? '●' : '○'}
      </button>
      <button
        style={{ ...iconBtnStyle, color: 'var(--text-3)' }}
        title="Delete"
        onClick={(e) => {
          e.stopPropagation()
          if (window.confirm(`Delete route "${route.name || route.urlPattern}"?`)) onDelete()
        }}
      >
        ×
      </button>
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-2)', fontSize: 11, padding: '0 2px', lineHeight: 1,
}
