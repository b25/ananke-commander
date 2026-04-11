import { useEffect, useState } from 'react'
import '@xterm/xterm/css/xterm.css'
import type { GitUiPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'
import { useXterm } from '../terminal/useXterm'

type Props = {
  pane: GitUiPaneState
  isActive: boolean
  onClose: () => void
}

export function GitUiPane({ pane, isActive, onClose }: Props) {
  const [isCrashed, setIsCrashed] = useState(false)
  const { hostRef, fitRef, termRef } = useXterm(pane.id, pane.cwd, 5000, undefined, 'gitui', [])

  useEffect(() => {
    if (isActive) {
      if (termRef.current) setTimeout(() => termRef.current?.focus(), 10)
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

  useEffect(() => {
    const unsubExit = window.ananke.pty.onExit(({ paneId, exitCode }) => {
      if (paneId === pane.id && exitCode !== 0) {
        setIsCrashed(true)
      }
    })
    return () => { unsubExit() }
  }, [pane.id])

  const handleInstall = () => {
    setIsCrashed(false)
    window.ananke.pty.spawn(pane.id, termRef.current?.cols || 80, termRef.current?.rows || 24, pane.cwd, '/bin/bash', ['-c', 'brew install gitui && gitui || (echo "\\r\\nFailed to automatically install gitui. Please install it manually." && sleep 10)'])
  }

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={`GitUI: ${pane.cwd}`} paneType="gitui" onClose={onClose} />
      <div className="pane-body" style={{ position: 'relative' }}>
        <div ref={hostRef} className="terminal-host" style={{ width: '100%', height: '100%' }} />
        {isCrashed && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 10 }}>
            <h3 style={{ marginBottom: 16 }}>GitUI Not Found</h3>
            <p style={{ marginBottom: 24, opacity: 0.8 }}>The `gitui` executable could not be found via your standard pathways.</p>
            <button type="button" className="primary" onClick={handleInstall}>Install via Homebrew</button>
          </div>
        )}
      </div>
    </div>
  )
}
