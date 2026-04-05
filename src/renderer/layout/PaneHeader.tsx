import type { ReactNode } from 'react'

type Props = {
  title: string
  onClose: () => void
  needsAttention?: boolean
  actions?: ReactNode
}

export function PaneHeader({ title, onClose, needsAttention, actions }: Props) {
  return (
    <div className="pane-header">
      <span className="title">{title}</span>
      {actions}
      <button type="button" className="pane-close-btn" onClick={onClose} title="Close pane">
        ×
      </button>
    </div>
  )
}
