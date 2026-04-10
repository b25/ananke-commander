import { useRef, useState } from 'react'
import type { WorkspaceState } from '../../shared/contracts'

type Props = {
  workspaces: WorkspaceState[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClone: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function WorkspaceRail({ workspaces, activeId, onSelect, onAdd, onClone, onRename, onDelete }: Props) {
  const [ctxMenu, setCtxMenu] = useState<{ wsId: string; x: number; y: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const closeMenu = () => setCtxMenu(null)

  const commitRename = (wsId: string) => {
    const trimmed = editingName.trim()
    if (trimmed) onRename(wsId, trimmed)
    setEditingId(null)
  }

  return (
    <aside className="workspace-rail" onClick={closeMenu}>
      {workspaces.map((ws, i) => (
        <button
          key={ws.id}
          type="button"
          className={`ws-pill ${ws.id === activeId ? 'active' : ''}`}
          title={ws.name}
          onClick={(e) => { e.stopPropagation(); onSelect(ws.id) }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setEditingId(ws.id)
            setEditingName(ws.name)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setCtxMenu({ wsId: ws.id, x: e.clientX, y: e.clientY })
          }}
        >
          {editingId === ws.id ? (
            <input
              className="ws-pill-rename"
              value={editingName}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => commitRename(ws.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(ws.id) }
                if (e.key === 'Escape') { e.preventDefault(); setEditingId(null) }
              }}
            />
          ) : (
            i + 1
          )}
        </button>
      ))}
      <button type="button" className="ws-pill ws-pill--add" title="Add workspace" onClick={onAdd}>
        +
      </button>

      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="ctx-menu__item"
            onClick={() => { onClone(ctxMenu.wsId); closeMenu() }}
          >
            Clone Workspace
          </button>
          <button
            type="button"
            className="ctx-menu__item ctx-menu__item--danger"
            disabled={workspaces.length <= 1}
            onClick={() => {
              if (workspaces.length <= 1) return
              onDelete(ctxMenu.wsId)
              closeMenu()
            }}
          >
            Delete Workspace
          </button>
        </div>
      )}
    </aside>
  )
}
