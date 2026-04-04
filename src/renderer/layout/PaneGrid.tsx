import { Children, useCallback, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
}

export function PaneGrid({ children }: Props) {
  const [splitRatio, setSplitRatio] = useState(0.5)
  const onSplitRatio = useCallback((r: number) => setSplitRatio(r), [])
  const items = Children.toArray(children)
  const n = items.length
  if (n === 0) return null
  if (n === 1) {
    return <div className="pane-stack pane-stack--single">{items[0]}</div>
  }
  if (n === 2) {
    return (
      <div className="pane-stack pane-stack--split">
        <div className="pane-stack__cell" style={{ flex: splitRatio }}>
          {items[0]}
        </div>
        <div
          className="pane-stack__gutter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          onMouseDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startR = splitRatio
            const row = e.currentTarget.parentElement!
            const startW = row.getBoundingClientRect().width
            const onMove = (ev: MouseEvent) => {
              const dx = ev.clientX - startX
              const delta = startW > 0 ? dx / startW : 0
              onSplitRatio(Math.min(0.88, Math.max(0.12, startR + delta)))
            }
            const onUp = () => {
              window.removeEventListener('mousemove', onMove)
              window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
          }}
        />
        <div className="pane-stack__cell" style={{ flex: 1 - splitRatio }}>
          {items[1]}
        </div>
      </div>
    )
  }
  return <div className="pane-stack pane-stack--grid">{items}</div>
}
