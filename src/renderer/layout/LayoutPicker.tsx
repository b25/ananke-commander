import { useEffect, useRef, useState } from 'react'
import { LAYOUTS, bestLayout, type Layout } from '../lib/layouts'
import { LayoutThumb } from '../lib/layoutThumb'

interface Props {
  activeLayoutId: string
  screenPanesCount: number
  onSelect: (layout: Layout) => void
}

// Items: [autofit, ...LAYOUTS]  — index 0 = autofit
const ITEM_COUNT = LAYOUTS.length + 1

export function LayoutPicker({ activeLayoutId, screenPanesCount, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Combined outside-click + Escape + Arrow key handler
  useEffect(() => {
    if (!open) return
    // Focus first item when popover opens
    const btns = popoverRef.current?.querySelectorAll<HTMLButtonElement>('button')
    btns?.[0]?.focus()

    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        const btns = Array.from(popoverRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        if (btns.length === 0) return
        const current = btns.findIndex((b) => b === document.activeElement)
        if (current < 0) return
        let next = current
        if (e.key === 'ArrowDown') next = (current + 1) % ITEM_COUNT
        if (e.key === 'ArrowUp') next = (current - 1 + ITEM_COUNT) % ITEM_COUNT
        if (e.key === 'Home') next = 0
        if (e.key === 'End') next = ITEM_COUNT - 1
        btns[next]?.focus()
      }
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

  const activeLayout = LAYOUTS.find(l => l.id === activeLayoutId) ?? LAYOUTS[0]

  const pick = (layout: Layout) => { onSelect(layout); setOpen(false) }
  const autoFit = () => pick(bestLayout(screenPanesCount))

  return (
    <div className="layout-picker" ref={ref}>
      <button
        type="button"
        className={`layout-picker__trigger${open ? ' open' : ''}`}
        title={`Layout: ${activeLayout.label} (click to change)`}
        aria-label="Select screen layout"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="layout-picker-menu"
        onClick={() => setOpen(o => !o)}
      >
        <LayoutThumb slots={activeLayout.slots} width={36} height={26} />
        <span className="layout-picker__chevron">▾</span>
      </button>

      {open && (
        <div id="layout-picker-menu" className="layout-picker__popover" ref={popoverRef} role="menu" aria-label="Layout options">
          <button
            type="button"
            className="layout-picker__option layout-picker__autofit"
            onClick={autoFit}
            role="menuitem"
          >
            <span className="layout-picker__autofit-icon">⊞</span>
            <span className="layout-picker__label">Auto-fit</span>
          </button>
          <div className="layout-picker__divider" />
          {LAYOUTS.map(layout => (
            <button
              key={layout.id}
              type="button"
              role="menuitemradio"
              aria-checked={layout.id === activeLayoutId}
              className={`layout-picker__option${layout.id === activeLayoutId ? ' active' : ''}`}
              onClick={() => pick(layout)}
            >
              <LayoutThumb slots={layout.slots} width={60} height={44} />
              {layout.id === activeLayoutId && <span className="layout-picker__check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
