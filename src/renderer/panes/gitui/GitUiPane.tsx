import { useEffect, useRef, useState } from 'react'
import '@xterm/xterm/css/xterm.css'
import type { GitUiPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'
import { useXterm } from '../terminal/useXterm'

type Props = {
  pane: GitUiPaneState
  isActive: boolean
  fontSize: number
  fontFamily: string
  onClose: () => void
}

export function GitUiPane({ pane, isActive, fontSize, fontFamily, onClose }: Props) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const outputRef = useRef('')
  const { hostRef, fitRef, termRef } = useXterm(pane.id, pane.cwd, 5000, undefined, 'gitui', [], fontSize, fontFamily)

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
    // Capture output to distinguish "not found" from other errors
    const unsubData = window.ananke.pty.onData(({ paneId, data }) => {
      if (paneId === pane.id) outputRef.current += data
    })
    const unsubExit = window.ananke.pty.onExit(({ paneId, exitCode }) => {
      if (paneId !== pane.id) return
      if (exitCode !== 0) {
        const out = outputRef.current.toLowerCase()
        if (out.includes('error launching pty') || out.includes('enoent') || out.includes('not found')) {
          setErrorMsg('notfound')
        } else {
          setErrorMsg('error')
        }
      }
    })
    return () => { unsubData(); unsubExit() }
  }, [pane.id])

  const handleInstall = () => {
    setErrorMsg(null)
    outputRef.current = ''
    window.ananke.pty.spawn(pane.id, termRef.current?.cols || 80, termRef.current?.rows || 24, pane.cwd, '/bin/bash', ['-c', 'brew install gitui && echo "\\r\\nInstalled! Reopen this pane." && sleep 3'])
  }

  const handleRetry = () => {
    setErrorMsg(null)
    outputRef.current = ''
    window.ananke.pty.spawn(pane.id, termRef.current?.cols || 80, termRef.current?.rows || 24, pane.cwd, 'gitui', [])
  }

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={`GitUI: ${pane.cwd.split('/').pop() || pane.cwd}`} paneType="gitui" onClose={onClose} />
      <div className="pane-body" style={{ position: 'relative' }}>
        <div ref={hostRef} className="terminal-host" style={{ width: '100%', height: '100%' }} />
        {errorMsg === 'notfound' && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 10, gap: 12 }}>
            <h3 style={{ margin: 0 }}>GitUI Not Found</h3>
            <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>The `gitui` binary was not found in PATH.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="primary" onClick={handleInstall}>Install via Homebrew</button>
              <button type="button" onClick={handleRetry}>Retry</button>
            </div>
          </div>
        )}
        {errorMsg === 'error' && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.75)', color: 'var(--danger)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, zIndex: 10 }}>
            <span>GitUI exited with an error. This directory may not be a git repository.</span>
            <button type="button" onClick={handleRetry} style={{ marginLeft: 'auto' }}>Retry</button>
          </div>
        )}
      </div>
    </div>
  )
}
