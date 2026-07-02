import { createPortal } from 'react-dom'
import { useModal } from '../../lib/useModal'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

/** Inline single-field prompt (replaces window.prompt, which doesn't work in Electron). */
export function InlinePromptDialog({ label, value, onChange, onSubmit, onCancel }: Props) {
  useModal()
  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()} style={{ minWidth: 320 }}>
        <h2>{label}</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel}>Cancel</button>
            <button type="submit" className="primary" disabled={!value.trim()}>OK</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
