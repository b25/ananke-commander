import { useEffect, useState } from 'react'

interface Props {
  sessionId: string
  title: string
  onClose: () => void
}

export function TerminalHistoryPanel({ sessionId, title, onClose }: Props) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    void window.ananke.termHistory.read(sessionId).then(setText)
  }, [sessionId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="term-history-inline">
      <div className="term-history-inline__header">
        <span className="term-history-inline__title">{title}</span>
        <button type="button" className="pane-close-btn" onClick={onClose}>&times;</button>
      </div>
      <div className="term-history-inline__body">
        {text === null
          ? <div style={{ padding: 12, color: 'var(--muted)' }}>Loading...</div>
          : <pre className="term-history-inline__pre">{text}</pre>
        }
      </div>
    </div>
  )
}
