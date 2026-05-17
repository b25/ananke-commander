import type { PaneState } from '../../shared/contracts'
import { paneIntersectsViewport, paneScreenIndex } from './screenIndex.ts'

export type MountPaneContext = {
  visibleScreenIndex: number
  collapsedIds: string[]
  activePaneId: string | null
  canvasOffset: { x: number; y: number }
  vpW: number
  vpH: number
}

/** Whether to mount full pane UI (vs lightweight placeholder). */
export function shouldMountPaneContent(
  pane: PaneState,
  ctx: MountPaneContext,
  warmedPaneIds?: ReadonlySet<string>
): boolean {
  if (pane.type === 'browser') return true
  if (ctx.collapsedIds.includes(pane.id)) return false
  if (paneScreenIndex(pane) !== ctx.visibleScreenIndex) return false

  if (pane.id === ctx.activePaneId) return true
  if (pane.needsAttention) return true
  if (warmedPaneIds?.has(pane.id)) return true

  return paneIntersectsViewport(pane, ctx.canvasOffset, ctx.vpW, ctx.vpH)
}
