import type { PaneState } from '../../shared/contracts'

export const PANE_MIN_W = 300
export const PANE_MIN_H = 200

/** Map fractional pane coords to pixel geometry for the current viewport. */
export function applyFractions(panes: PaneState[], vpW: number, vpH: number): PaneState[] {
  return panes.map((p) => {
    const pxLeft = Math.round(p.xPct * vpW)
    const pxTop = Math.round(p.yPct * vpH)
    const pxRight = Math.round((p.xPct + p.wPct) * vpW)
    const pxBottom = Math.round((p.yPct + p.hPct) * vpH)
    return {
      ...p,
      x: pxLeft,
      y: pxTop,
      width: Math.max(PANE_MIN_W, pxRight - pxLeft),
      height: Math.max(PANE_MIN_H, pxBottom - pxTop)
    }
  })
}
