import { useEffect, useRef, useState } from 'react'
import { LAYOUTS, bestLayout, type Layout } from '../lib/layouts'
import { LayoutThumb } from '../lib/layoutThumb'

interface Props {
  activeLayoutId: string
  screenPanesCount: number
  onSelect: (layout: Layout) => void
}

export function LayoutPicker({ activeLayoutId, screenPanesCount, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const activeLayout = LAYOUTS.find(l => l.id === activeLayoutId) ?? LAYOUTS[0]

  const handleAutoFit = () => {
    onSelect(bestLayout(screenPanesCount))
    setOpen(false)
  }

  return (
    <div className="layout-picker" ref={ref}>
      <button
        type="button"
        className={`layout-picker__trigger${open ? ' open' : ''}`}
        title={`Layout: ${activeLayout.label}`}
        onClick={() => setOpen(o => !o)}
      >
        <LayoutThumb slots={activeLayout.slots} width={36} height={26} />
        <span className="layout-picker__chevron">▾</span>
      </button>

      {open && (
        <div className="layout-picker__popover">
          <button
            type="button"
            className="layout-picker__option layout-picker__autofit"
            onClick={handleAutoFit}
          >
            <span className="layout-picker__autofit-icon">⊞</span>
            <span className="layout-picker__label">Auto-fit</span>
          </button>
          <div className="layout-picker__divider" />
          {LAYOUTS.map(layout => (
            <button
              key={layout.id}
              type="button"
              className={`layout-picker__option${layout.id === activeLayoutId ? ' active' : ''}`}
              onClick={() => { onSelect(layout); setOpen(false) }}
            >
              <LayoutThumb slots={layout.slots} width={60} height={44} />
              <span className="layout-picker__label">{layout.label}</span>
              {layout.id === activeLayoutId && <span className="layout-picker__check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
