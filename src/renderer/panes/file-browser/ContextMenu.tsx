import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  shortcut?: string
  danger?: boolean
  separator?: boolean
  onClick: () => void
}

type Props = {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
      const focusable = itemRefs.current.filter((el): el is HTMLButtonElement => !!el)
      if (focusable.length === 0) return
      const current = document.activeElement as HTMLButtonElement | null
      const currentIndex = focusable.findIndex((el) => el === current)
      if (currentIndex < 0) return
      let nextIndex = currentIndex
      if (e.key === 'ArrowDown') nextIndex = Math.min(focusable.length - 1, currentIndex + 1)
      if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1)
      if (e.key === 'Home') nextIndex = 0
      if (e.key === 'End') nextIndex = focusable.length - 1
      if (nextIndex !== currentIndex) {
        e.preventDefault()
        focusable[nextIndex]?.focus()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    const first = itemRefs.current.find((el): el is HTMLButtonElement => !!el)
    first?.focus()
  }, [items])

  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
  }

  return (
    <div ref={ref} className="ctx-menu" style={style} role="menu" aria-label="File context menu">
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="ctx-menu__sep" role="separator" />
        ) : (
          <button
            key={i}
            ref={(el) => { itemRefs.current[i] = el }}
            type="button"
            className={`ctx-menu__item${item.danger ? ' ctx-menu__item--danger' : ''}`}
            role="menuitem"
            onClick={() => { item.onClick(); onClose() }}
          >
            <span className="ctx-menu__label">{item.label}</span>
            {item.shortcut && (
              <span className="ctx-menu__shortcut">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  )
}
