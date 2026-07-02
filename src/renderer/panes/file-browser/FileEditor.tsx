import { useMemo, useState } from 'react'
import { useModal } from '../../lib/useModal'

type FileEditorProps = {
  path: string
  text: string
  readOnly: boolean
  onSave: (newText: string) => void
  onClose: () => void
}

export function FileEditor({ path, text, readOnly, onSave, onClose }: FileEditorProps) {
  useModal()
  const heading = readOnly ? `Viewing: ${path}` : `Editing: ${path}`
  const [draft, setDraft] = useState(text)
  const isDirty = useMemo(() => !readOnly && draft !== text, [draft, readOnly, text])

  const requestClose = () => {
    if (isDirty && !confirm('Discard unsaved changes?')) return
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={requestClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-editor-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '70vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <h2 id="file-editor-title" style={{ fontSize: 10, margin: '0 0 8px' }}>{heading}</h2>
        <textarea
          id="file-editor-textarea"
          aria-label="File content"
          autoFocus
          value={draft}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          style={{
            flex: 1,
            minHeight: 300,
            resize: 'vertical',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: 8
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={requestClose}>
            Cancel
          </button>
          {!readOnly && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                onSave(draft)
                onClose()
              }}
            >
              Save File
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
