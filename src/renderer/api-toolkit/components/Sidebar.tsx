import { useStore } from '../store'
import { CollectionTree } from './CollectionTree'
import { HistoryList } from './HistoryList'
import { EnvEditor } from './EnvEditor'

type SidebarTab = 'collections' | 'history' | 'environments'

export function Sidebar() {
  const { sidebarTab, setSidebarTab, activeEnvironmentId, environments } = useStore()
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
          onClick={() => setSidebarTab('environments' as SidebarTab)}
          title={activeEnvName ? `Active: ${activeEnvName}` : 'No active environment'}
        >
          Env{activeEnvName ? ' ✓' : ''}
        </div>
      </div>

      {sidebarTab === 'collections' && <CollectionTree />}
      {sidebarTab === 'history' && <HistoryList />}
      {sidebarTab === ('environments' as SidebarTab) && <EnvEditor />}
    </aside>
  )
}
