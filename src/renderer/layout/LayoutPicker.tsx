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
  const [focusIdx, setFocusIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Combined outside-click + Escape + Arrow key handler
  useEffect(() => {
    if (!open) return
    // Focus first item when popover opens
    setFocusIdx(0)
    const btns = popoverRef.current?.querySelectorAll<HTMLButtonElement>('button')
    btns?.[0]?.focus()

    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx(prev => {
          const next = e.key === 'ArrowDown'
            ? (prev + 1) % ITEM_COUNT
            : (prev - 1 + ITEM_COUNT) % ITEM_COUNT
          const btns = popoverRef.current?.querySelectorAll<HTMLButtonElement>('button')
          btns?.[next]?.focus()
          return next
        })
      }
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
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
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <LayoutThumb slots={activeLayout.slots} width={36} height={26} />
        <span className="layout-picker__chevron">▾</span>
      </button>

      {open && (
        <div className="layout-picker__popover" ref={popoverRef} role="listbox" aria-label="Layout options">
          <button
            type="button"
            className="layout-picker__option layout-picker__autofit"
            onClick={autoFit}
          >
            <span className="layout-picker__autofit-icon">⊞</span>
            <span className="layout-picker__label">Auto-fit</span>
          </button>
          <div className="layout-picker__divider" />
          {LAYOUTS.map(layout => (
            <button
              key={layout.id}
              type="button"
              role="option"
              aria-selected={layout.id === activeLayoutId}
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
