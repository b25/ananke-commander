import type { PaneState } from '../../shared/contracts'

/** Screen index (0–3) from pane fractional coords — integer part of xPct/yPct. */
export function paneScreenIndex(p: Pick<PaneState, 'xPct' | 'yPct'>): number {
  return paneRow(p) * 2 + paneCol(p)
}

export function paneCol(p: Pick<PaneState, 'xPct'>): number {
  return Math.floor(p.xPct)
}

export function paneRow(p: Pick<PaneState, 'yPct'>): number {
  return Math.floor(p.yPct)
}

export function screenIndexToColRow(screenIndex: number): { col: number; row: number } {
  return { col: screenIndex % 2, row: Math.floor(screenIndex / 2) }
}

export function paneOnScreen(
  p: Pick<PaneState, 'xPct' | 'yPct'>,
  screenCol: number,
  screenRow: number
): boolean {
  return paneCol(p) === screenCol && paneRow(p) === screenRow
}

export function paneFractionalOffsets(p: Pick<PaneState, 'xPct' | 'yPct'>): {
  xFrac: number
  yFrac: number
} {
  return { xFrac: p.xPct - paneCol(p), yFrac: p.yPct - paneRow(p) }
}

/** Active screen from canvas offset and viewport size (snapped grid). */
export function offsetToScreenIndex(
  canvasOffset: { x: number; y: number },
  vpW: number,
  vpH: number
): number {
  if (!vpW || !vpH) return 0
  const col = Math.max(0, Math.min(1, Math.round(canvasOffset.x / vpW)))
  const row = Math.max(0, Math.min(1, Math.round(canvasOffset.y / vpH)))
  return row * 2 + col
}

/** Whether pane pixel bounds overlap the current viewport window on the canvas. */
export function paneIntersectsViewport(
  pane: Pick<PaneState, 'x' | 'y' | 'width' | 'height'>,
  canvasOffset: { x: number; y: number },
  vpW: number,
  vpH: number
): boolean {
  if (!vpW || !vpH) return false
  const vx0 = canvasOffset.x
  const vy0 = canvasOffset.y
  const vx1 = vx0 + vpW
  const vy1 = vy0 + vpH
  const right = pane.x + pane.width
  const bottom = pane.y + pane.height
  return pane.x < vx1 && right > vx0 && pane.y < vy1 && bottom > vy0
}
