import { useEffect, useRef, useState } from 'react'

interface Props {
  onRead: () => void
  onEdit: () => void
  onCopy: () => void
  onMove: () => void
  onNewFolder: () => void
  onNewFile: () => void
  onDelete: () => void
  onArchive: () => void
  onToggleHidden: () => void
  onCopyPath: () => void
  onNewTerminal: () => void
  onNewGitUI: () => void
  onChmod?: () => void
}

export function FileBrowserActions({
  onRead,
  onEdit,
  onCopy,
  onMove,
  onNewFolder,
  onNewFile,
  onDelete,
  onArchive,
  onToggleHidden,
  onCopyPath,
  onNewTerminal,
  onNewGitUI,
  onChmod,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: !open }))
    return () => {
      window.dispatchEvent(new CustomEvent('native-view-visibility', { detail: true }))
    }
  }, [open])

  const exec = (action: () => void) => {
    action()
    setOpen(false)
  }

  const Shortcut = ({ label }: { label: string }) => (
    <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>{label}</span>
  )

  const Sep = () => <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

  return (
    <div className="layout-picker" ref={ref}>
      <button
        type="button"
        className={`layout-picker__trigger btn-thin${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        Actions <span className="layout-picker__chevron">&#9662;</span>
      </button>

      {open && (
        <div className="layout-picker__popover" role="menu" style={{ right: 0, left: 'auto', minWidth: 200 }}>
          <button type="button" className="layout-picker__option" onClick={() => exec(onRead)} role="menuitem">
            <span className="layout-picker__label">Read</span><Shortcut label="F3" />
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onEdit)} role="menuitem">
            <span className="layout-picker__label">Edit</span><Shortcut label="F4" />
          </button>
          <Sep />
          <button type="button" className="layout-picker__option" onClick={() => exec(onCopy)} role="menuitem">
            <span className="layout-picker__label">Copy...</span><Shortcut label="F5" />
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onMove)} role="menuitem">
            <span className="layout-picker__label">Move...</span><Shortcut label="F6" />
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onNewFolder)} role="menuitem">
            <span className="layout-picker__label">New Folder</span><Shortcut label="F7" />
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onNewFile)} role="menuitem">
            <span className="layout-picker__label">New File</span><Shortcut label="Alt+F7" />
          </button>
          <button type="button" className="layout-picker__option layout-picker__option--danger" onClick={() => exec(onDelete)} role="menuitem" style={{ color: 'var(--danger)' }}>
            <span className="layout-picker__label">Delete</span><Shortcut label="F8" />
          </button>
          <Sep />
          <button type="button" className="layout-picker__option" onClick={() => exec(onCopyPath)} role="menuitem">
            <span className="layout-picker__label">Copy Path</span>
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onNewTerminal)} role="menuitem">
            <span className="layout-picker__label">New Terminal Here</span>
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onNewGitUI)} role="menuitem">
            <span className="layout-picker__label">New GitUI Here</span>
          </button>
          {onChmod && (
            <button type="button" className="layout-picker__option" onClick={() => exec(onChmod)} role="menuitem">
              <span className="layout-picker__label">Set Execute Permission</span>
            </button>
          )}
          <Sep />
          <button type="button" className="layout-picker__option" onClick={() => exec(onArchive)} role="menuitem">
            <span className="layout-picker__label">Pack / Unpack</span><Shortcut label="Arc" />
          </button>
          <Sep />
          <button type="button" className="layout-picker__option" onClick={() => exec(onToggleHidden)} role="menuitem">
            <span className="layout-picker__label">Toggle Hidden Files</span><Shortcut label="H" />
          </button>
        </div>
      )}
    </div>
  )
}
