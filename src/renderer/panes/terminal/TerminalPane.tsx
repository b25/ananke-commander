import { useEffect } from 'react'
import '@xterm/xterm/css/xterm.css'
import type { TerminalPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'
import { useXterm } from './useXterm'

type Props = {
  pane: TerminalPaneState
  isActive: boolean
  scrollback: number
  onClose: () => void
}

export function TerminalPane({ pane, isActive, scrollback, onClose }: Props) {
  const { hostRef, fitRef } = useXterm(pane.id, pane.cwd, scrollback)

  useEffect(() => {
    if (isActive) fitRef.current?.fit()
  }, [isActive, fitRef])

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={pane.title} onClose={onClose} />
      <div className="pane-body">
        <div ref={hostRef} className="terminal-host" />
      </div>
    </div>
  )
}
