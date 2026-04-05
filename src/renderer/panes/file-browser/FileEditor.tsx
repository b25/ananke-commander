type FileEditorProps = {
  path: string
  text: string
  readOnly: boolean
  onSave: (newText: string) => void
  onClose: () => void
}

export function FileEditor({ path, text, readOnly, onSave, onClose }: FileEditorProps) {
  const heading = readOnly ? `Viewing: ${path}` : `Editing: ${path}`

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '70vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>{heading}</h2>
        <textarea
          id="file-editor-textarea"
          defaultValue={text}
          readOnly={readOnly}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 300,
            resize: 'vertical',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: 8
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {!readOnly && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                const el = document.getElementById('file-editor-textarea') as HTMLTextAreaElement | null
                if (el) onSave(el.value)
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
