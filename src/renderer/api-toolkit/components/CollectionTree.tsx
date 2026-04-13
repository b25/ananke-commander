import { useState } from 'react'
import { useStore } from '../store'
import type { Collection, CollectionItem, RequestItem } from '../../../shared/api-toolkit-contracts'

function MethodBadge({ protocol, method }: { protocol: 'http' | 'grpc'; method?: string }) {
  if (protocol === 'grpc') return <span className="method-badge method-grpc">gRPC</span>
  return <span className={`method-badge method-${method ?? 'GET'}`}>{method ?? 'GET'}</span>
}

function TreeItem({
  item,
  depth,
  onOpen,
}: {
  item: CollectionItem
  depth: number
  onOpen: (item: RequestItem) => void
}) {
  const [open, setOpen] = useState(true)

  if (item.type === 'folder') {
    return (
      <div>
        <div
          className="tree-item"
          style={{ paddingLeft: `${16 + depth * 12}px` }}
          onClick={() => setOpen(!open)}
        >
          <span style={{ fontSize: 12 }}>{open ? '▾' : '▸'}</span>
          <span className="tree-item-name">{item.name}</span>
        </div>
        {open &&
          item.items.map((child) => (
            <TreeItem key={child.id} item={child} depth={depth + 1} onOpen={onOpen} />
          ))}
      </div>
    )
  }

  return (
    <div
      className="tree-item"
      style={{ paddingLeft: `${16 + depth * 12}px` }}
      onClick={() => onOpen(item)}
    >
      <MethodBadge
        protocol={item.protocol}
        method={item.protocol === 'http' ? item.httpRequest?.method : undefined}
      />
      <span className="tree-item-name">{item.name}</span>
    </div>
  )
}

export function CollectionTree() {
  const { collections, openTab, setActiveTab } = useStore()

  function openRequest(item: RequestItem, col: Collection) {
    openTab({
      name: item.name,
      protocol: item.protocol,
      httpRequest: item.httpRequest,
      grpcRequest: item.grpcRequest,
      collectionId: col.id,
      requestId: item.id,
      dirty: false,
    })
  }

  function newCollection() {
    const name = window.prompt('Collection name')?.trim()
    if (!name) return
    const col: Collection = {
      id: crypto.randomUUID(),
      name,
      items: [],
      variables: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    useStore.getState().setCollections([...collections, col])
    window.ananke.apiToolkit.storage.saveCollection(col)
  }

  return (
    <div className="sidebar-content">
      <div className="sidebar-section-header" onClick={() => {}}>
        Collections
        <span className="sidebar-action-btn" onClick={(e) => { e.stopPropagation(); newCollection() }} title="New collection">+</span>
      </div>

      {collections.length === 0 && (
        <div style={{ padding: '24px 16px', color: 'var(--text-2)', fontSize: 12, textAlign: 'center' }}>
          No collections yet.<br />
          <span className="text-accent" style={{ cursor: 'pointer' }} onClick={newCollection}>Create one</span>
        </div>
      )}

      {collections.map((col) => (
        <div key={col.id}>
          <div className="sidebar-section-header" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
            {col.name}
          </div>
          {col.items.map((item) => (
            <TreeItem key={item.id} item={item} depth={0} onOpen={(ri) => openRequest(ri, col)} />
          ))}
        </div>
      ))}

      <div style={{ padding: '8px 12px' }}>
        <div
          className="tree-item"
          style={{ color: 'var(--text-accent)', cursor: 'pointer', paddingLeft: 12 }}
          onClick={() => {
            useStore.getState().openTab()
            const tabs = useStore.getState().tabs
            setActiveTab(tabs[tabs.length - 1].id)
          }}
        >
          + New Request
        </div>
      </div>
    </div>
  )
}
