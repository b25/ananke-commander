import { useEffect, useRef, useState } from 'react'

interface Props {
  diagOpen: boolean
  drawer: 'none' | 'recent' | 'settings'
  onToggleDiag: () => void
  onToggleRecent: () => void
  onToggleSettings: () => void
}

export function AppMenuDropdown({ diagOpen, drawer, onToggleDiag, onToggleRecent, onToggleSettings }: Props) {
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

  return (
    <div className="layout-picker" ref={ref}>
      <button
        type="button"
        className={`layout-picker__trigger btn-thin${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="App Menu"
      >
        App <span className="layout-picker__chevron">▾</span>
      </button>

      {open && (
        <div className="layout-picker__popover" role="menu" style={{ right: 0, left: 'auto' }}>
          <button
            type="button"
            className="layout-picker__option"
            onClick={() => { onToggleDiag(); setOpen(false) }}
            role="menuitem"
          >
            <span className="layout-picker__autofit-icon">{(diagOpen) ? '☑' : '☐'}</span>
            <span className="layout-picker__label">Diagnostics</span>
          </button>
          
          <button
            type="button"
            className="layout-picker__option"
            onClick={() => { onToggleRecent(); setOpen(false) }}
            role="menuitem"
          >
            <span className="layout-picker__autofit-icon">{(drawer === 'recent') ? '☑' : '☐'}</span>
            <span className="layout-picker__label">Recent Workspaces</span>
          </button>
          
          <button
            type="button"
            className="layout-picker__option"
            onClick={() => { onToggleSettings(); setOpen(false) }}
            role="menuitem"
          >
            <span className="layout-picker__autofit-icon">{(drawer === 'settings') ? '☑' : '☐'}</span>
            <span className="layout-picker__label">Settings</span>
          </button>
        </div>
      )}
    </div>
  )
}
