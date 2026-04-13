import type { ApiToolkitPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'
import { App, ProtocolToggle } from '../../api-toolkit/AppInner'
import '../../api-toolkit/styles/global.css'

type Props = {
  pane: ApiToolkitPaneState
  isActive: boolean
  onClose: () => void
}

export function ApiToolkitPane({ pane, isActive, onClose }: Props) {
  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title="API Toolkit" paneType="api-toolkit" onClose={onClose} actions={<ProtocolToggle />} />
      <div className="pane-body" style={{ padding: 0, overflow: 'hidden' }}>
        <App />
      </div>
    </div>
  )
}
