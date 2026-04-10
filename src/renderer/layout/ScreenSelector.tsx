interface Props {
  canvasOffset: { x: number; y: number }
  viewportW: number
  viewportH: number
  onSelect: (x: number, y: number) => void
}

// 4 screens in a 2×2 grid:
//  0(TL) 1(TR)
//  2(BL) 3(BR)
const SCREENS = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: 1, row: 1 }
]

export function ScreenSelector({ canvasOffset, viewportW, viewportH, onSelect }: Props) {
  const activeCol = Math.round(canvasOffset.x / (viewportW || 1))
  const activeRow = Math.round(canvasOffset.y / (viewportH || 1))

  return (
    <div className="screen-selector" title="Screen (Alt+Arrow to switch)">
      {SCREENS.map(({ col, row }, idx) => {
        const isActive = col === activeCol && row === activeRow
        return (
          <div
            key={idx}
            className={`screen-selector__cell${isActive ? ' active' : ''}`}
            onClick={() => onSelect(col * viewportW, row * viewportH)}
          />
        )
      })}
    </div>
  )
}
