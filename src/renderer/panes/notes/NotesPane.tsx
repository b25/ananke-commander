import { useEffect, useRef, useState } from 'react'
import type { NotesPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'

type Props = {
  pane: NotesPaneState
  isActive: boolean
  notesUndoMax: number
  onUpdate: (next: NotesPaneState) => void
  onClose: () => void
}

export function NotesPane({ pane, isActive, notesUndoMax, onUpdate, onClose }: Props) {
  const undoStack = useRef<string[]>([])
  const [localBody, setLocalBody] = useState(pane.body)
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setLocalBody(pane.body) }, [pane.id])

  useEffect(() => {
    return () => {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current)
    }
  }, [])

  const wordCount = localBody.trim() === '' ? 0 : localBody.trim().split(/\s+/).length

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setLocalBody(val)
    undoStack.current.push(pane.body)
    if (undoStack.current.length > Math.max(1, notesUndoMax)) undoStack.current.shift()
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current)
    updateTimerRef.current = setTimeout(() => {
      void onUpdate({ ...pane, body: val })
    }, 400)
  }

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={pane.title} paneType="notes" onClose={onClose} />
      <div className="pane-body">
        <div className="notes-editor">
          <input
            value={pane.title}
            onChange={(e) => onUpdate({ ...pane, title: e.target.value })}
            placeholder="Title"
          />
          <textarea
            value={localBody}
            onChange={handleBodyChange}
            placeholder="Markdown notes…"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault()
                if (undoStack.current.length > 0) {
                  const prev = undoStack.current.pop()!
                  void onUpdate({ ...pane, body: prev })
                }
              }
            }}
          />
          <div className="notes-status-bar">
            {wordCount} words · {localBody.length} chars
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void window.ananke.clipboard.writeText(localBody)}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={async () => {
                const p = await window.ananke.dialog.saveFile(`${pane.title || 'note'}.md`)
                if (!p) return
                await window.ananke.fs.writeUtf8(p, localBody)
              }}
            >
              Export…
            </button>
            <button
              type="button"
              className="primary"
              onClick={async () => {
                const snap = await window.ananke.state.get()
                const { vaultPath, subfolder } = snap.settings.obsidian
                if (!vaultPath) {
                  alert('Set Obsidian vault path in Settings')
                  return
                }
                await window.ananke.notes.saveVault(
                  vaultPath,
                  subfolder,
                  pane.title || 'note',
                  `---\ntitle: ${pane.title}\n---\n\n${pane.body}`
                )
                alert('Saved to vault folder')
              }}
            >
              Save to vault
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
