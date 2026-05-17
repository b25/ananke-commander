import { useEffect, useRef, useState } from 'react'
import type { PaneType } from '../../shared/contracts'

const OPTIONS: { type: PaneType; label: string; icon: string }[] = [
  { type: 'file-browser', label: 'Files', icon: '🗂' },
  { type: 'terminal', label: 'Terminal', icon: '🖥' },
  { type: 'browser', label: 'Browser', icon: '🌐' },
  { type: 'notes', label: 'Notes', icon: '📝' },
  { type: 'gitui', label: 'GitUI', icon: '🧰' },
  { type: 'api-toolkit', label: 'API Toolkit', icon: '🛠' }
]

interface Props {
  onSelect: (type: PaneType) => void
}

export function NewPanePicker({ onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const btns = popoverRef.current?.querySelectorAll<HTMLButtonElement>('button')
    btns?.[0]?.focus()
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
      const all = Array.from(popoverRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      if (all.length === 0) return
      const current = all.findIndex((b) => b === document.activeElement)
      if (current < 0) return
      e.preventDefault()
      let next = current
      if (e.key === 'ArrowDown') next = Math.min(all.length - 1, current + 1)
      if (e.key === 'ArrowUp') next = Math.max(0, current - 1)
      if (e.key === 'Home') next = 0
      if (e.key === 'End') next = all.length - 1
      all[next]?.focus()
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
        aria-label="Create new pane"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="new-pane-menu"
      >
        New <span className="layout-picker__chevron">▾</span>
      </button>

      {open && (
        <div id="new-pane-menu" className="layout-picker__popover" role="menu" aria-label="New pane types" ref={popoverRef}>
          {OPTIONS.map(opt => (
            <button
              key={opt.type}
              type="button"
              className="layout-picker__option"
              onClick={() => { onSelect(opt.type); setOpen(false) }}
              role="menuitem"
            >
              <span className="layout-picker__autofit-icon">{opt.icon}</span>
              <span className="layout-picker__label">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
