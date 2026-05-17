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

const CELL_W = 26
const CELL_H = 20

export function ScreenSelector({ canvasOffset, viewportW, viewportH, screenLayouts, panesPerScreen, onSelect }: Props) {
  const vpW = viewportW || 1
  const vpH = viewportH || 1
  const activeCol = Math.round(canvasOffset.x / vpW)
  const activeRow = Math.round(canvasOffset.y / vpH)
  const activeIdx = activeRow * 2 + activeCol

  const goTo = (idx: number) => {
    const { col, row } = SCREENS[idx]
    onSelect(col * vpW, row * vpH)
  }

  return (
    <div
      className="screen-selector"
      role="radiogroup"
      aria-label="Screen selector (Alt+Arrow to switch)"
      onKeyDown={(e) => {
        const map: Record<string, number> = {
          ArrowRight: activeIdx === 0 ? 1 : activeIdx === 2 ? 3 : activeIdx,
          ArrowLeft:  activeIdx === 1 ? 0 : activeIdx === 3 ? 2 : activeIdx,
          ArrowDown:  activeIdx <= 1 ? activeIdx + 2 : activeIdx,
          ArrowUp:    activeIdx >= 2 ? activeIdx - 2 : activeIdx,
        }
        const next = map[e.key]
        if (next !== undefined && next !== activeIdx) { e.preventDefault(); goTo(next) }
      }}
    >
      <div className="screen-selector__inner">
        {SCREENS.map(({ col, row }, idx) => {
          const isActive = idx === activeIdx
          const layoutId = screenLayouts[idx] ?? bestLayout(panesPerScreen[idx] ?? 0).id
          const layout = LAYOUTS.find(l => l.id === layoutId) ?? LAYOUTS[0]
          return (
            <button
              key={idx}
              type="button"
              role="radio"
              aria-checked={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`screen-selector__cell screen-selector__cell-btn${isActive ? ' active' : ''}`}
              title={`Screen ${idx + 1}: ${layout.label}`}
              aria-label={`Switch to screen ${idx + 1} (${layout.label})`}
              onClick={() => goTo(idx)}
            >
              <LayoutThumb slots={layout.slots} width={CELL_W - 4} height={CELL_H - 4} invert={isActive} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
