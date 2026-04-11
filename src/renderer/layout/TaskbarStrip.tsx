import type { PaneState } from '../../shared/contracts'

const PANE_ICONS: Record<string, string> = {
  'file-browser': '🗂',
  'terminal': '🖥',
  'browser': '🌐',
  'notes': '📝',
  'radar': '📡',
}

interface Props {
  panes: PaneState[]
  activePaneId: string | null
  collapsedIds: string[]
  onRestore: (paneId: string) => void
  onActivate: (paneId: string) => void
  onClose: (paneId: string) => void
}

export function TaskbarStrip({ panes, activePaneId, collapsedIds, onRestore, onActivate, onClose }: Props) {
  if (panes.length === 0) return null
  
  const collapsedSet = new Set(collapsedIds)

  return (
    <div className="collapsed-strip">
      {panes.map((pane) => {
        const isCollapsed = collapsedSet.has(pane.id)
        const isActive = activePaneId === pane.id && !isCollapsed
        
        let pillClass = 'collapsed-pill'
        if (isCollapsed) pillClass += ' is-ghosted'
        if (isActive) pillClass += ' is-active'
        
        return (
          <div 
            key={pane.id} 
            className={pillClass} 
            title={pane.title} 
            onClick={() => isCollapsed ? onRestore(pane.id) : onActivate(pane.id)}
          >
            <span className="collapsed-pill__icon">{PANE_ICONS[pane.type] ?? '▪'}</span>
            <span className="collapsed-pill__title">{pane.title}</span>
            <button
              type="button"
              className="collapsed-pill__close"
              title="Close"
              onClick={(e) => { e.stopPropagation(); onClose(pane.id) }}
            >✕</button>
          </div>
        )
      })}
    </div>
  )
}
