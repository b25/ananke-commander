import type { PaneState } from '../../shared/contracts'

type Props = {
  pane: PaneState
  reason: 'off-screen' | 'suspended'
}

const HINTS: Record<Props['reason'], string> = {
  'off-screen': 'This pane is on another screen. Use the screen selector or Alt+Arrow to switch.',
  suspended: 'Click the pane header to activate and load its contents.'
}

export function PanePlaceholder({ pane, reason }: Props) {
  return (
    <div className="pane-tile pane-tile--suspended" aria-hidden="true">
      <div className="pane-header">
        <span className="title">{pane.title}</span>
      </div>
      <div className="pane-body" style={{ padding: 12, fontSize: 11, color: 'var(--muted)' }}>
        {HINTS[reason]}
      </div>
    </div>
  )
}
