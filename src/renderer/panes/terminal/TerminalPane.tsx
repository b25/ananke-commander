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
  const { hostRef, fitRef, termRef } = useXterm(pane.id, pane.cwd, scrollback)

  useEffect(() => {
    if (isActive) {
      if (termRef.current) {
        // Yield momentarily to allow React DOM render cycle to quiesce before stealing OS focus
        setTimeout(() => termRef.current?.focus(), 10)
      }
      const timer = requestAnimationFrame(() => {
        try {
          if (hostRef.current && hostRef.current.clientWidth > 0 && hostRef.current.clientHeight > 0) {
            fitRef.current?.fit()
          }
        } catch { /* ignore */ }
      })
      return () => cancelAnimationFrame(timer)
    }
  }, [isActive, fitRef, termRef])

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={pane.title} onClose={onClose} />
      <div className="pane-body">
        <div 
          ref={hostRef} 
          className="terminal-host" 
          onContextMenu={(e) => {
            e.preventDefault()
            void window.ananke.shell.popTerminalMenu()
          }}
        />
      </div>
    </div>
  )
}
