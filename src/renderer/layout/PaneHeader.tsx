import type { ReactNode } from 'react'
import type { PaneType } from '../../shared/contracts'

const PANE_ICONS: Record<PaneType, string> = {
  'file-browser': '🗂',
  'terminal': '🖥',
  'browser': '🌐',
  'notes': '📝',
  'radar': '📡',
  'gitui': '🧰',
  'api-toolkit': '🛠'
}

type Props = {
  title: string
  onClose: () => void
  needsAttention?: boolean
  actions?: ReactNode
  paneType?: PaneType
}

export function PaneHeader({ title, onClose, needsAttention, actions, paneType }: Props) {
  return (
    <div className="pane-header">
      {paneType && (
        <span className="pane-type-icon" aria-hidden="true">
          {PANE_ICONS[paneType]}
        </span>
      )}
      <span className="title">{title}</span>
      {needsAttention && <span className="pane-attention-dot" aria-label="needs attention" />}
      {actions}
      <button type="button" className="pane-close-btn" onClick={onClose} title="Close pane">
        ×
      </button>
    </div>
  )
}
