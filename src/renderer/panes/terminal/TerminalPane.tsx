import { useEffect, useState } from 'react'
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
  const [termTitle, setTermTitle] = useState(`🖥 ${pane.cwd}`)
  const { hostRef, fitRef, termRef } = useXterm(pane.id, pane.cwd, scrollback, (title) => {
    // Shells usually set the title to 'user@host: dir' or similar. We enforce the icon.
    // Replace 'user@host:' to only show the working directory.
    let cleanTitle = title.replace(/^🖥\s*/, '')
    cleanTitle = cleanTitle.replace(/^[^@\s]+@[^:\s]+:\s*/, '')
    
    // Fallback locally if the shell sent an empty title for some reason
    setTermTitle(`🖥 ${cleanTitle || pane.cwd}`)
  })

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
      <PaneHeader title={termTitle} onClose={onClose} />
      <div className="pane-body">
        <div 
          ref={hostRef} 
          className="terminal-host" 
          onContextMenu={(e) => {
            e.preventDefault()
          }}
        />
      </div>
    </div>
  )
}
