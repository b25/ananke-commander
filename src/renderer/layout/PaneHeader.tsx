import type { ReactNode } from 'react'
import type { PaneType } from '../../shared/contracts'
import { PaneIcon } from '../components/icons'

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
          <PaneIcon type={paneType} size={12} />
        </span>
      )}
      <span className="title">{title}</span>
      {needsAttention && <span className="pane-attention-dot" role="status" aria-label="needs attention" />}
      {actions}
      <button type="button" className="pane-close-btn" onClick={onClose} title="Close pane" aria-label={`Close ${title} pane`}>
        ✕
      </button>
    </div>
  )
}
