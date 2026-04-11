import { useEffect, useRef, useState } from 'react'

interface Props {
  onRead: () => void
  onEdit: () => void
  onCopy: () => void
  onMove: () => void
  onNewFolder: () => void
  onDelete: () => void
  onArchive: () => void
  onToggleHidden: () => void
}

export function FileBrowserActions({
  onRead,
  onEdit,
  onCopy,
  onMove,
  onNewFolder,
  onDelete,
  onArchive,
  onToggleHidden,
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

  return (
    <div className="layout-picker" ref={ref}>
      <button
        type="button"
        className={`layout-picker__trigger btn-thin${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        Actions <span className="layout-picker__chevron">▾</span>
      </button>

      {open && (
        <div className="layout-picker__popover" role="menu" style={{ right: 0, left: 'auto' }}>
          <button type="button" className="layout-picker__option" onClick={() => exec(onRead)} role="menuitem">
            <span className="layout-picker__label">Read</span>
            <span className="layout-picker__shortcut" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>F3</span>
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onEdit)} role="menuitem">
            <span className="layout-picker__label">Edit</span>
            <span className="layout-picker__shortcut" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>F4</span>
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onCopy)} role="menuitem">
            <span className="layout-picker__label">Copy…</span>
            <span className="layout-picker__shortcut" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>F5</span>
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onMove)} role="menuitem">
            <span className="layout-picker__label">Move…</span>
            <span className="layout-picker__shortcut" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>F6</span>
          </button>
          <button type="button" className="layout-picker__option" onClick={() => exec(onNewFolder)} role="menuitem">
            <span className="layout-picker__label">New Folder</span>
            <span className="layout-picker__shortcut" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>F7</span>
          </button>
          <button type="button" className="layout-picker__option layout-picker__option--danger" onClick={() => exec(onDelete)} role="menuitem" style={{ color: '#ff4d4f' }}>
            <span className="layout-picker__label">Delete</span>
            <span className="layout-picker__shortcut" style={{ marginLeft: 'auto', fontSize: 11 }}>F8</span>
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button type="button" className="layout-picker__option" onClick={() => exec(onArchive)} role="menuitem">
            <span className="layout-picker__label">Pack / Unpack</span>
            <span className="layout-picker__shortcut" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>Arc</span>
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button type="button" className="layout-picker__option" onClick={() => exec(onToggleHidden)} role="menuitem">
            <span className="layout-picker__label">Toggle Hidden Files</span>
            <span className="layout-picker__shortcut" style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>H</span>
          </button>
        </div>
      )}
    </div>
  )
}
