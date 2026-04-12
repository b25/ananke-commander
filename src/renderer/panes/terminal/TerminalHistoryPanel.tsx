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
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="term-history-modal" onClick={onClose}>
      <div className="term-history-modal__content" onClick={e => e.stopPropagation()}>
        <div className="term-history-modal__header">
          <span>{title}</span>
          <button type="button" className="pane-close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="term-history-modal__body">
          {text === null
            ? <div style={{ padding: 12, color: 'var(--muted)' }}>Loading...</div>
            : <pre className="term-history-modal__pre">{text}</pre>
          }
        </div>
      </div>
    </div>
  )
}
