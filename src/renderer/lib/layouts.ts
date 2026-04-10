import type { PaneState } from '../../shared/contracts'

export interface LayoutSlot {
  xFrac: number  // 0–1 within screen (left edge)
  yFrac: number  // 0–1 within screen (top edge)
  wFrac: number  // 0–1 of screen width
  hFrac: number  // 0–1 of screen height
}

export interface Layout {
  id: string
  label: string
  slots: LayoutSlot[]
}

const T = 1 / 3

export const LAYOUTS: Layout[] = [
  {
    id: 'full',
    label: 'Full',
    slots: [
      { xFrac: 0, yFrac: 0, wFrac: 1, hFrac: 1 }
    ]
  },
  {
    id: 'halves',
    label: '½ + ½',
    slots: [
      { xFrac: 0,   yFrac: 0, wFrac: 0.5, hFrac: 1 },
      { xFrac: 0.5, yFrac: 0, wFrac: 0.5, hFrac: 1 }
    ]
  },
  {
    id: '1h-2v',
    label: '½ + 2/4',
    slots: [
      { xFrac: 0,   yFrac: 0,   wFrac: 0.5, hFrac: 1   },
      { xFrac: 0.5, yFrac: 0,   wFrac: 0.5, hFrac: 0.5 },
      { xFrac: 0.5, yFrac: 0.5, wFrac: 0.5, hFrac: 0.5 }
    ]
  },
  {
    id: '4-quad',
    label: '4/4',
    slots: [
      { xFrac: 0,   yFrac: 0,   wFrac: 0.5, hFrac: 0.5 },
      { xFrac: 0.5, yFrac: 0,   wFrac: 0.5, hFrac: 0.5 },
      { xFrac: 0,   yFrac: 0.5, wFrac: 0.5, hFrac: 0.5 },
      { xFrac: 0.5, yFrac: 0.5, wFrac: 0.5, hFrac: 0.5 }
    ]
  },
  {
    id: '1h-3v',
    label: '½ + 3/4',
    slots: [
      { xFrac: 0,   yFrac: 0,     wFrac: 0.5, hFrac: 1 },
      { xFrac: 0.5, yFrac: 0,     wFrac: 0.5, hFrac: T },
      { xFrac: 0.5, yFrac: T,     wFrac: 0.5, hFrac: T },
      { xFrac: 0.5, yFrac: T * 2, wFrac: 0.5, hFrac: T }
    ]
  }
]

/** Pick the best default layout for N panes on a screen. */
export function bestLayout(n: number): Layout {
  if (n <= 1) return LAYOUTS[0]  // full
  if (n === 2) return LAYOUTS[1]  // halves
  if (n === 3) return LAYOUTS[2]  // 1h-2v
  if (n === 4) return LAYOUTS[3]  // 4-quad
  return LAYOUTS[4]               // 1h-3v (handles 4; extras stay put)
}

const MIN_W = 300
const MIN_H = 200

/**
 * Reposition all panes on the current screen into the given layout.
 * Panes on other screens are untouched.
 */
export function applyLayout(
  allPanes: PaneState[],
  layout: Layout,
  screenCol: number,
  screenRow: number,
  vpW: number,
  vpH: number
): PaneState[] {
  const onScreen  = allPanes.filter(p => Math.floor(p.xPct) === screenCol && Math.floor(p.yPct) === screenRow)
  const offScreen = allPanes.filter(p => Math.floor(p.xPct) !== screenCol || Math.floor(p.yPct) !== screenRow)

  const arranged = onScreen.map((pane, i) => {
    const slot = layout.slots[i]
    if (!slot) return pane  // more panes than slots — leave in place
    const xPct = screenCol + slot.xFrac
    const yPct = screenRow + slot.yFrac
    const wPct = slot.wFrac
    const hPct = slot.hFrac
    return {
      ...pane,
      xPct, yPct, wPct, hPct,
      x:      xPct * vpW,
      y:      yPct * vpH,
      width:  Math.max(MIN_W, wPct * vpW),
      height: Math.max(MIN_H, hPct * vpH)
    }
  })

  return [...offScreen, ...arranged]
}
