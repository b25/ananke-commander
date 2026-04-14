import { useStore } from '../store'
import { CollectionTree } from './CollectionTree'
import { HistoryList } from './HistoryList'
import { EnvEditor } from './EnvEditor'
import { MockProxyPanel } from './MockProxyPanel'

export function Sidebar() {
  const { sidebarTab, setSidebarTab, activeEnvironmentId, environments, mockRunning } = useStore()
  const activeEnvName = environments.find((e) => e.id === activeEnvironmentId)?.name

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <div
          className={`sidebar-tab ${sidebarTab === 'collections' ? 'active' : ''}`}
          onClick={() => setSidebarTab('collections')}
        >
          Collections
        </div>
        <div
          className={`sidebar-tab ${sidebarTab === 'history' ? 'active' : ''}`}
          onClick={() => setSidebarTab('history')}
        >
          History
        </div>
        <div
          className={`sidebar-tab ${sidebarTab === 'environments' ? 'active' : ''}`}
          onClick={() => setSidebarTab('environments')}
          title={activeEnvName ? `Active: ${activeEnvName}` : 'No active environment'}
        >
          Env{activeEnvName ? ' ✓' : ''}
        </div>
        <div
          className={`sidebar-tab ${sidebarTab === 'mock' ? 'active' : ''}`}
          onClick={() => setSidebarTab('mock')}
          title={mockRunning ? 'Mock server running' : 'Mock server stopped'}
        >
          Mock{mockRunning ? ' ●' : ''}
        </div>
      </div>

      {sidebarTab === 'collections' && <CollectionTree />}
      {sidebarTab === 'history' && <HistoryList />}
      {sidebarTab === 'environments' && <EnvEditor />}
      {sidebarTab === 'mock' && <MockProxyPanel />}
    </aside>
  )
}
