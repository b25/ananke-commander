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

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
  }

  return (
    <div ref={ref} className="ctx-menu" style={style} role="menu">
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="ctx-menu__sep" role="separator" />
        ) : (
          <button
            key={i}
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
