import { useEffect, useRef, useState } from 'react'
import type { AppStateSnapshot } from '../../shared/contracts'

interface Props {
  onClose: (newSnap?: AppStateSnapshot) => void
}

export function TomlEditorModal({ onClose }: Props) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void window.ananke.config.readToml().then(t => {
      setText(t ?? '')
      setTimeout(() => textareaRef.current?.focus(), 0)
    })
  }, [])

  const handleSave = async () => {
    if (text === null || saving) return
    setSaving(true)
    const { error: err, snapshot } = await window.ananke.config.applyToml(text)
    setSaving(false)
    if (err) {
      setError(err)
    } else {
      onClose(snapshot ?? undefined)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    setDirty(true)
    setError(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      void handleSave()
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.currentTarget as HTMLTextAreaElement
      const start = el.selectionStart
      const end = el.selectionEnd
      const next = el.value.substring(0, start) + '  ' + el.value.substring(end)
      setText(next)
      setDirty(true)
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2 })
    }
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const handleCancel = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="modal toml-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="toml-editor-header">
          <span className="toml-editor-title">
            workspace.toml{dirty && <span className="toml-dirty">●</span>}
          </span>
          <button type="button" className="toml-editor-close" onClick={handleCancel}>✕</button>
        </div>
        {text === null
          ? <div className="toml-editor-loading">Loading…</div>
          : <textarea
              ref={textareaRef}
              className="toml-editor-area"
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoComplete="off"
            />
        }
        {error && <div className="toml-editor-error">{error}</div>}
        <div className="toml-editor-footer">
          <button type="button" className="primary" onClick={() => void handleSave()} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span className="toml-editor-hint">⌘S · Esc to cancel · Tab inserts 2 spaces</span>
          <button type="button" onClick={handleCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
