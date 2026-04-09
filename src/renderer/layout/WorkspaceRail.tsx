import type { WorkspaceState } from '../../shared/contracts'

type Props = {
  workspaces: WorkspaceState[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
}

export function WorkspaceRail({ workspaces, activeId, onSelect, onAdd }: Props) {
  return (
    <aside className="workspace-rail">
      {workspaces.map((ws, i) => (
        <button
          key={ws.id}
          type="button"
          className={`ws-pill ${ws.id === activeId ? 'active' : ''}`}
          title={ws.name}
          onClick={() => onSelect(ws.id)}
        >
          {i + 1}
        </button>
      ))}
      <button type="button" className="ws-pill ws-pill--add" title="Add workspace" onClick={onAdd}>
        +
      </button>
    </aside>
  )
}
