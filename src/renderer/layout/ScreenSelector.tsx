import { LAYOUTS, bestLayout } from '../lib/layouts'
import { LayoutThumb } from '../lib/layoutThumb'

interface Props {
  canvasOffset: { x: number; y: number }
  viewportW: number
  viewportH: number
  screenLayouts: Record<number, string>
  panesPerScreen: Record<number, number>
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

const CELL_W = 32
const CELL_H = 24

export function ScreenSelector({ canvasOffset, viewportW, viewportH, screenLayouts, panesPerScreen, onSelect }: Props) {
  const activeCol = Math.round(canvasOffset.x / (viewportW || 1))
  const activeRow = Math.round(canvasOffset.y / (viewportH || 1))

  return (
    <div className="screen-selector" title="Screen (Alt+Arrow to switch)">
      {SCREENS.map(({ col, row }, idx) => {
        const isActive = col === activeCol && row === activeRow
        const layoutId = screenLayouts[idx] ?? bestLayout(panesPerScreen[idx] ?? 0).id
        const layout = LAYOUTS.find(l => l.id === layoutId) ?? LAYOUTS[0]
        return (
          <div
            key={idx}
            className={`screen-selector__cell${isActive ? ' active' : ''}`}
            title={`Screen ${idx + 1}: ${layout.label}`}
            onClick={() => onSelect(col * viewportW, row * viewportH)}
          >
            <LayoutThumb slots={layout.slots} width={CELL_W - 4} height={CELL_H - 4} />
          </div>
        )
      })}
    </div>
  )
}
