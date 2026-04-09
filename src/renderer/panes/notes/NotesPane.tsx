import { useRef } from 'react'
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

  const setBody = (nextBody: string, recordUndo: boolean) => {
    if (recordUndo) {
      const max = Math.max(1, notesUndoMax)
      undoStack.current = [...undoStack.current, pane.body].slice(-max)
    }
    onUpdate({ ...pane, body: nextBody })
  }

  const undo = () => {
    const prev = undoStack.current.pop()
    if (prev !== undefined) onUpdate({ ...pane, body: prev })
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
            value={pane.body}
            onChange={(e) => setBody(e.target.value, true)}
            placeholder="Markdown notes…"
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={undo}>
              Undo
            </button>
            <button
              type="button"
              onClick={() => void window.ananke.clipboard.writeText(pane.body)}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={async () => {
                const p = await window.ananke.dialog.saveFile(`${pane.title || 'note'}.md`)
                if (!p) return
                await window.ananke.fs.writeUtf8(p, pane.body)
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
