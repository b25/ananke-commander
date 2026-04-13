import { useStore } from '../store'
import { CollectionTree } from './CollectionTree'
import { HistoryList } from './HistoryList'

export function Sidebar() {
  const { sidebarTab, setSidebarTab } = useStore()

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
      </div>

      {sidebarTab === 'collections' ? <CollectionTree /> : <HistoryList />}
    </aside>
  )
}
