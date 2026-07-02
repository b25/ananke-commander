import { createPortal } from 'react-dom'
import type { FileBrowserPaneState } from '../../../shared/contracts'
import { useModal } from '../../lib/useModal'

type Props = {
  mode: 'copy' | 'move'
  activePath: string
  selectedCount: number
  dests: FileBrowserPaneState[]
  destPaneId: string
  onDestChange: (id: string) => void
  onCancel: () => void
  onConfirm: () => void
}

/** F5/F6 destination picker: choose another file-browser pane to copy/move the selection into. */
export function CopyMoveDialog({ mode, activePath, selectedCount, dests, destPaneId, onDestChange, onCancel, onConfirm }: Props) {
  useModal()
  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'copy' ? 'Copy (F5)' : 'Move (F6)'}</h2>
        <p className="muted">Source: {activePath}</p>
        <p className="muted">Selected: {selectedCount} items</p>
        <label className="muted">Destination file browser pane</label>
        <select
          value={destPaneId}
          onChange={(e) => onDestChange(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
        >
          <option value="">— choose —</option>
          {dests.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} → {p.focusedSide === 'left' ? p.leftPath : p.rightPath}
            </option>
          ))}
        </select>
        {!dests.length && (
          <p className="muted">Add another file browser pane in this workspace.</p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={!destPaneId || !selectedCount}
            onClick={onConfirm}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
