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
  },
  {
    id: '6-grid',
    label: '2×3',
    slots: [
      { xFrac: 0,   yFrac: 0,     wFrac: 0.5, hFrac: T },
      { xFrac: 0.5, yFrac: 0,     wFrac: 0.5, hFrac: T },
      { xFrac: 0,   yFrac: T,     wFrac: 0.5, hFrac: T },
      { xFrac: 0.5, yFrac: T,     wFrac: 0.5, hFrac: T },
      { xFrac: 0,   yFrac: T * 2, wFrac: 0.5, hFrac: T },
      { xFrac: 0.5, yFrac: T * 2, wFrac: 0.5, hFrac: T },
    ]
  },
  {
    id: '9-grid',
    label: '3×3',
    slots: [
      { xFrac: 0,     yFrac: 0,     wFrac: T, hFrac: T },
      { xFrac: T,     yFrac: 0,     wFrac: T, hFrac: T },
      { xFrac: T * 2, yFrac: 0,     wFrac: T, hFrac: T },
      { xFrac: 0,     yFrac: T,     wFrac: T, hFrac: T },
      { xFrac: T,     yFrac: T,     wFrac: T, hFrac: T },
      { xFrac: T * 2, yFrac: T,     wFrac: T, hFrac: T },
      { xFrac: 0,     yFrac: T * 2, wFrac: T, hFrac: T },
      { xFrac: T,     yFrac: T * 2, wFrac: T, hFrac: T },
      { xFrac: T * 2, yFrac: T * 2, wFrac: T, hFrac: T },
    ]
  }
]

/** Slot counts for all known layouts. */
export const LAYOUT_SLOTS: Record<string, number> = {
  'full':    1,
  'halves':  2,
  '1h-2v':   3,
  '4-quad':  4,
  '1h-3v':   4,
  '6-grid':  6,
  '9-grid':  9,
}

/**
 * Auto-progression path: adding panes advances through these tiers only.
 * Manual layouts (1h-2v, 1h-3v) are available in LayoutPicker but not in auto-progression.
 */
export const LAYOUT_PROGRESSION = ['full', 'halves', '4-quad', '6-grid', '9-grid'] as const
export type ProgressionLayoutId = typeof LAYOUT_PROGRESSION[number]

/**
 * Return the next auto-progression layout ID, or null if already at max.
 * If currentId is a manual layout (not in progression), find the next progression
 * tier above its slot count.
 */
export function nextProgressionLayout(currentId: string): string | null {
  const idx = (LAYOUT_PROGRESSION as readonly string[]).indexOf(currentId)
  if (idx !== -1) {
    // In progression — return next tier
    return idx < LAYOUT_PROGRESSION.length - 1 ? LAYOUT_PROGRESSION[idx + 1] : null
  }
  // Manual layout — find the first progression tier with more slots
  const currentSlots = LAYOUT_SLOTS[currentId] ?? 1
  const next = LAYOUT_PROGRESSION.find(id => LAYOUT_SLOTS[id] > currentSlots)
  return next ?? null
}

/** Pick the best default layout for N panes on a screen. */
export function bestLayout(n: number): Layout {
  if (n <= 1) return LAYOUTS[0]  // full
  if (n === 2) return LAYOUTS[1]  // halves
  if (n === 3) return LAYOUTS[2]  // 1h-2v
  if (n === 4) return LAYOUTS[3]  // 4-quad
  if (n <= 6)  return LAYOUTS[5]  // 6-grid
  if (n <= 9)  return LAYOUTS[6]  // 9-grid
  return LAYOUTS[6]               // max — extras stay put
}

const MIN_W = 300
const MIN_H = 200

/**
 * True if every slot in the layout produces a pane at least MIN_W × MIN_H px.
 */
export function layoutFits(layout: Layout, vpW: number, vpH: number): boolean {
  return layout.slots.every(s => s.wFrac * vpW >= MIN_W && s.hFrac * vpH >= MIN_H)
}

/**
 * Return intentId if it fits; otherwise walk LAYOUT_PROGRESSION descending to
 * find the largest layout that fits. Always returns at least 'full'.
 */
export function fittingLayout(intentId: string, vpW: number, vpH: number): string {
  const intentLayout = LAYOUTS.find(l => l.id === intentId)
  if (intentLayout && layoutFits(intentLayout, vpW, vpH)) return intentId
  for (let i = LAYOUT_PROGRESSION.length - 1; i >= 0; i--) {
    const candId = LAYOUT_PROGRESSION[i]
    const cand = LAYOUTS.find(l => l.id === candId)!
    if (layoutFits(cand, vpW, vpH)) return candId
  }
  return 'full'
}

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

  // Sort spatially (top-to-bottom, left-to-right) so slot assignment is
  // visually predictable regardless of workspace insertion order.
  const sorted = [...onScreen].sort((a, b) => {
    const aY = a.yPct - screenRow, bY = b.yPct - screenRow
    if (Math.abs(aY - bY) > 0.001) return aY - bY
    return (a.xPct - screenCol) - (b.xPct - screenCol)
  })

  const arranged = sorted.map((pane, i) => {
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
