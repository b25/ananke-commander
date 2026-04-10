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
  onRestore: (paneId: string) => void
  onClose: (paneId: string) => void
}

export function CollapsedStrip({ panes, onRestore, onClose }: Props) {
  if (panes.length === 0) return null
  return (
    <div className="collapsed-strip">
      {panes.map((pane) => (
        <div key={pane.id} className="collapsed-pill" title={pane.title} onClick={() => onRestore(pane.id)}>
          <span className="collapsed-pill__icon">{PANE_ICONS[pane.type] ?? '▪'}</span>
          <span className="collapsed-pill__title">{pane.title}</span>
          <button
            type="button"
            className="collapsed-pill__close"
            title="Close"
            onClick={(e) => { e.stopPropagation(); onClose(pane.id) }}
          >✕</button>
        </div>
      ))}
    </div>
  )
}
