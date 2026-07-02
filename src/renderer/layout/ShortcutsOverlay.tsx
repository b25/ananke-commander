import { useEffect } from 'react'
import { useModal } from '../lib/useModal'

interface Props {
  onClose: () => void
}

const SHORTCUTS: { key: string; description: string }[] = [
  { key: 'Alt + Arrow', description: 'Pan to adjacent screen (2×2 grid)' },
  { key: '? (Shift + /)', description: 'Show this shortcuts reference' },
  { key: 'Cmd/Ctrl + 1–9', description: 'Switch to workspace N' },
  { key: 'Cmd/Ctrl + W', description: 'Close the active pane (Undo toast appears)' },
  { key: 'Cmd/Ctrl + Shift + F', description: 'Best-fit layout for the current screen' },
  { key: 'Ctrl + Tab', description: 'Cycle to next pane' },
  { key: 'Ctrl + Shift + Tab', description: 'Cycle to previous pane' },
]

export function ShortcutsOverlay({ onClose }: Props) {
  useModal()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
        <table className="shortcuts-table">
          <tbody>
            {SHORTCUTS.map(({ key, description }) => (
              <tr key={key}>
                <td className="shortcuts-key"><kbd>{key}</kbd></td>
                <td className="shortcuts-desc">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="shortcuts-footer">
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
