import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store'
import { CollectionTree } from './CollectionTree'
import { HistoryList } from './HistoryList'
import { EnvEditor } from './EnvEditor'
import { MockProxyPanel } from './MockProxyPanel'

export function Sidebar() {
  const { sidebarTab, setSidebarTab, activeEnvironmentId, environments, mockRunning } = useStore(
    useShallow((s) => ({
      sidebarTab: s.sidebarTab,
      setSidebarTab: s.setSidebarTab,
      activeEnvironmentId: s.activeEnvironmentId,
      environments: s.environments,
      mockRunning: s.mockRunning,
    }))
  )
  const activeEnvName = environments.find((e) => e.id === activeEnvironmentId)?.name

  return (
    <aside className="atk-sidebar">
      <div className="sidebar-tabs" role="tablist" aria-label="API toolkit sections">
        <button
          type="button"
          className={`sidebar-tab ${sidebarTab === 'collections' ? 'active' : ''}`}
          onClick={() => setSidebarTab('collections')}
          role="tab"
          aria-selected={sidebarTab === 'collections'}
          aria-controls="api-toolkit-sidebar-panel"
        >
          Collections
        </button>
        <button
          type="button"
          className={`sidebar-tab ${sidebarTab === 'history' ? 'active' : ''}`}
          onClick={() => setSidebarTab('history')}
          role="tab"
          aria-selected={sidebarTab === 'history'}
          aria-controls="api-toolkit-sidebar-panel"
        >
          History
        </button>
        <button
          type="button"
          className={`sidebar-tab ${sidebarTab === 'environments' ? 'active' : ''}`}
          onClick={() => setSidebarTab('environments')}
          title={activeEnvName ? `Active: ${activeEnvName}` : 'No active environment'}
          role="tab"
          aria-selected={sidebarTab === 'environments'}
          aria-controls="api-toolkit-sidebar-panel"
        >
          Env{activeEnvName ? ' ✓' : ''}
        </button>
        <button
          type="button"
          className={`sidebar-tab ${sidebarTab === 'mock' ? 'active' : ''}`}
          onClick={() => setSidebarTab('mock')}
          title={mockRunning ? 'Mock server running' : 'Mock server stopped'}
          role="tab"
          aria-selected={sidebarTab === 'mock'}
          aria-controls="api-toolkit-sidebar-panel"
        >
          Mock{mockRunning ? ' ●' : ''}
        </button>
      </div>

      <div id="api-toolkit-sidebar-panel" role="tabpanel">
        {sidebarTab === 'collections' && <CollectionTree />}
        {sidebarTab === 'history' && <HistoryList />}
        {sidebarTab === 'environments' && <EnvEditor />}
        {sidebarTab === 'mock' && <MockProxyPanel />}
      </div>
    </aside>
  )
}
