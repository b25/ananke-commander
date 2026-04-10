import type { PaneState } from '../../shared/contracts'

const GAP = 12
const MAX_ITER = 30

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

/** Push rect B away from rect A using the axis of minimum overlap. */
function pushAway(
  ax: number, ay: number, aw: number, ah: number,
  b: PaneState
): PaneState {
  // Overlap depths along each axis
  const overlapX = Math.min(ax + aw, b.x + b.width) - Math.max(ax, b.x) + GAP
  const overlapY = Math.min(ay + ah, b.y + b.height) - Math.max(ay, b.y) + GAP

  if (overlapX <= overlapY) {
    // Less penetration in X → push right
    return { ...b, x: ax + aw + GAP }
  } else {
    // Less penetration in Y → push down
    return { ...b, y: ay + ah + GAP }
  }
}

/**
 * Find the first canvas position where a new pane of size (w, h) doesn't
 * overlap any existing pane.
 */
export function findFreeSlot(panes: PaneState[], w: number, h: number): { x: number; y: number } {
  const candidates: Array<{ x: number; y: number }> = [{ x: 40, y: 40 }]

  for (const p of panes) {
    candidates.push({ x: p.x + p.width + GAP, y: p.y })
    candidates.push({ x: p.x, y: p.y + p.height + GAP })
    candidates.push({ x: p.x + p.width + GAP, y: p.y + p.height + GAP })
  }

  for (const { x, y } of candidates) {
    if (x < 0 || y < 0) continue
    const overlaps = panes.some((p) => rectsOverlap(x, y, w, h, p.x, p.y, p.width, p.height))
    if (!overlaps) return { x, y }
  }

  // Grid scan fallback
  for (let row = 0; row < 30; row++) {
    for (let col = 0; col < 30; col++) {
      const x = 40 + col * (w + GAP)
      const y = 40 + row * (h + GAP)
      const overlaps = panes.some((p) => rectsOverlap(x, y, w, h, p.x, p.y, p.width, p.height))
      if (!overlaps) return { x, y }
    }
  }

  const maxBottom = panes.reduce((m, p) => Math.max(m, p.y + p.height), 0)
  return { x: 40, y: maxBottom + GAP }
}

/**
 * Multi-pass cascade: the fixed pane (being resized/moved) never moves.
 * All other panes are pushed away iteratively until no overlaps remain.
 * Panes can only be pushed right or down, so the algorithm always terminates.
 */
export function resolveOverlaps(panes: PaneState[], fixedId: string): PaneState[] {
  if (panes.length < 2) return panes

  let result = panes.map((p) => ({ ...p }))

  for (let iter = 0; iter < MAX_ITER; iter++) {
    let anyMoved = false

    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result.length; j++) {
        if (i === j) continue
        const a = result[i]
        const b = result[j]
        if (b.id === fixedId) continue          // never move the fixed pane
        if (!rectsOverlap(a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height)) continue

        const moved = pushAway(a.x, a.y, a.width, a.height, b)
        result[j] = moved
        anyMoved = true
      }
    }

    if (!anyMoved) break
  }

  return result
}
