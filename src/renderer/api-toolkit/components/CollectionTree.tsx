import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { Collection, CollectionItem, RequestItem } from '../../../shared/api-toolkit-contracts'

function MethodBadge({ protocol, method }: { protocol: 'http' | 'grpc'; method?: string }) {
  if (protocol === 'grpc') return <span className="method-badge method-grpc">gRPC</span>
  return <span className={`method-badge method-${method ?? 'GET'}`}>{method ?? 'GET'}</span>
}

type CtxMenu =
  | { kind: 'collection'; col: Collection; x: number; y: number }
  | { kind: 'item'; col: Collection; item: CollectionItem; x: number; y: number }

function TreeItem({
  item,
  col,
  depth,
  onOpen,
  onCtx,
}: {
  item: CollectionItem
  col: Collection
  depth: number
  onOpen: (item: RequestItem) => void
  onCtx: (e: React.MouseEvent, item: CollectionItem) => void
}) {
  const [open, setOpen] = useState(true)

  if (item.type === 'folder') {
    return (
      <div>
        <div
          className="tree-item"
          style={{ paddingLeft: `${16 + depth * 12}px` }}
          onClick={() => setOpen(!open)}
          onContextMenu={(e) => { e.preventDefault(); onCtx(e, item) }}
        >
          <span style={{ fontSize: 10 }}>{open ? '▾' : '▸'}</span>
          <span className="tree-item-name">{item.name}</span>
        </div>
        {open && item.items.map((child) => (
          <TreeItem key={child.id} item={child} col={col} depth={depth + 1} onOpen={onOpen} onCtx={onCtx} />
        ))}
      </div>
    )
  }

  return (
    <div
      className="tree-item"
      style={{ paddingLeft: `${16 + depth * 12}px` }}
      onClick={() => onOpen(item)}
      onContextMenu={(e) => { e.preventDefault(); onCtx(e, item) }}
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
  const { collections, openTab, setActiveTab, addItemToCollection, updateCollectionItem, removeCollectionItem, importPostmanCollection } = useStore()
  const [ctx, setCtx] = useState<CtxMenu | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [notification, setNotification] = useState<string | null>(null)

  // Inline prompt (window.prompt doesn't work in Electron's sandboxed renderer)
  const [inlinePrompt, setInlinePrompt] = useState<{
    label: string
    onSubmit: (v: string) => void
  } | null>(null)
  const [promptValue, setPromptValue] = useState('')

  function showPrompt(label: string, defaultValue: string, onSubmit: (v: string) => void) {
    setPromptValue(defaultValue)
    setInlinePrompt({ label, onSubmit })
    setCtx(null)
  }

  function submitPrompt() {
    const v = promptValue.trim()
    if (v) inlinePrompt?.onSubmit(v)
    setInlinePrompt(null)
  }

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
    showPrompt('Collection name', '', (name) => {
      const col: Collection = {
        id: crypto.randomUUID(),
        name,
        items: [],
        variables: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      useStore.getState().setCollections([...useStore.getState().collections, col])
      window.ananke.apiToolkit.storage.saveCollection(col)
    })
  }

  function addRequest(col: Collection) {
    showPrompt('Request name', 'New Request', async (name) => {
      const item: RequestItem = {
        type: 'request',
        id: crypto.randomUUID(),
        name,
        protocol: 'http',
        httpRequest: {
          method: 'GET',
          url: '',
          params: [],
          headers: [{ key: 'Accept', value: '*/*', enabled: true }],
          body: { mode: 'none' },
          auth: { type: 'none' },
          timeout: 30000,
        },
      }
      await addItemToCollection(col.id, item)
    })
  }

  function renameItem(col: Collection, item: CollectionItem) {
    showPrompt('Rename', item.name, async (name) => {
      if (name === item.name) return
      await updateCollectionItem(col.id, item.id, { name } as Partial<CollectionItem>)
    })
  }

  async function deleteItem(col: Collection, item: CollectionItem) {
    const label = item.type === 'folder' ? `folder "${item.name}" and all its contents` : `"${item.name}"`
    if (!window.confirm(`Delete ${label}?`)) return
    await removeCollectionItem(col.id, item.id)
  }

  async function deleteCollection(col: Collection) {
    if (!window.confirm(`Delete collection "${col.name}"?`)) return
    await window.ananke.apiToolkit.storage.deleteCollection(col.id)
    useStore.getState().setCollections(useStore.getState().collections.filter((c) => c.id !== col.id))
  }

  function renameCollection(col: Collection) {
    showPrompt('Rename collection', col.name, async (name) => {
      if (name === col.name) return
      const updated = { ...col, name, updatedAt: Date.now() }
      await window.ananke.apiToolkit.storage.saveCollection(updated)
      useStore.getState().setCollections(useStore.getState().collections.map((c) => c.id === col.id ? updated : c))
    })
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      try {
        const { count } = await importPostmanCollection(text)
        setNotification(`Imported ${count} request${count !== 1 ? 's' : ''}`)
        setTimeout(() => setNotification(null), 3000)
      } catch (err) {
        setNotification(`Import failed: ${String(err)}`)
        setTimeout(() => setNotification(null), 4000)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="sidebar-content" onClick={() => setCtx(null)}>
      {/* Hidden file input for Postman import */}
      <input
        ref={importRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* Inline prompt */}
      {inlinePrompt && (
        <div style={{ padding: '4px 8px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-2)', flexShrink: 0 }}>{inlinePrompt.label}:</span>
          <input
            className="kv-input"
            style={{ flex: 1 }}
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitPrompt()
              if (e.key === 'Escape') setInlinePrompt(null)
            }}
            autoFocus
          />
          <span className="sidebar-action-btn" onClick={submitPrompt} title="Confirm">✓</span>
          <span className="sidebar-action-btn" onClick={() => setInlinePrompt(null)} title="Cancel">✕</span>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div style={{ padding: '4px 8px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--text-accent)' }}>
          {notification}
        </div>
      )}

      <div className="sidebar-section-header">
        Collections
        <div style={{ display: 'flex', gap: 2 }}>
          <span
            className="sidebar-action-btn"
            onClick={(e) => { e.stopPropagation(); importRef.current?.click() }}
            title="Import from Postman…"
          >
            ↑
          </span>
          <span
            className="sidebar-action-btn"
            onClick={(e) => { e.stopPropagation(); newCollection() }}
            title="New collection"
          >
            +
          </span>
        </div>
      </div>

      {collections.length === 0 && !inlinePrompt && (
        <div style={{ padding: '24px 16px', color: 'var(--text-2)', fontSize: 10, textAlign: 'center' }}>
          No collections yet.<br />
          <span className="text-accent" style={{ cursor: 'pointer' }} onClick={newCollection}>Create one</span>
          {' or '}
          <span className="text-accent" style={{ cursor: 'pointer' }} onClick={() => importRef.current?.click()}>import from Postman</span>
        </div>
      )}

      {collections.map((col) => (
        <div key={col.id}>
          <div
            className="sidebar-section-header"
            style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-1)' }}
            onContextMenu={(e) => { e.preventDefault(); setCtx({ kind: 'collection', col, x: e.clientX, y: e.clientY }) }}
          >
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {col.name}
            </span>
            <span
              className="sidebar-action-btn"
              title="Add request"
              onClick={(e) => { e.stopPropagation(); addRequest(col) }}
            >
              +
            </span>
          </div>
          {col.items.map((item) => (
            <TreeItem
              key={item.id}
              item={item}
              col={col}
              depth={0}
              onOpen={(ri) => openRequest(ri, col)}
              onCtx={(e, it) => setCtx({ kind: 'item', col, item: it, x: e.clientX, y: e.clientY })}
            />
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

      {/* Context menu */}
      {ctx && (
        <div
          className="ctx-menu"
          style={{ position: 'fixed', top: ctx.y, left: ctx.x, zIndex: 9999, minWidth: 160 }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctx.kind === 'collection' && (
            <>
              <button className="ctx-menu__item" onClick={() => { addRequest(ctx.col); setCtx(null) }}>
                Add Request
              </button>
              <button className="ctx-menu__item" onClick={() => { renameCollection(ctx.col); setCtx(null) }}>
                Rename
              </button>
              <div className="ctx-menu__sep" />
              <button className="ctx-menu__item ctx-menu__item--danger" onClick={() => { void deleteCollection(ctx.col); setCtx(null) }}>
                Delete Collection
              </button>
            </>
          )}
          {ctx.kind === 'item' && (
            <>
              {ctx.item.type === 'request' && (
                <button className="ctx-menu__item" onClick={() => { openRequest(ctx.item as RequestItem, ctx.col); setCtx(null) }}>
                  Open
                </button>
              )}
              <button className="ctx-menu__item" onClick={() => { renameItem(ctx.col, ctx.item); setCtx(null) }}>
                Rename
              </button>
              <div className="ctx-menu__sep" />
              <button className="ctx-menu__item ctx-menu__item--danger" onClick={() => { void deleteItem(ctx.col, ctx.item); setCtx(null) }}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
