import { useEffect, useRef, useState } from 'react'
import type { PaneState, WorkspaceState } from '../../shared/contracts'
import { FloatingPane, type SnapRect } from './FloatingPane'

export const CANVAS_W = 4000
export const CANVAS_H = 4000
const PAN_STEP = 80

interface Props {
  workspace: WorkspaceState
  renderPane: (pane: PaneState) => React.ReactNode
  onActivate: (paneId: string) => void
  onGeometryChange: (paneId: string, x: number, y: number, w: number, h: number) => void
  onCanvasOffsetChange: (x: number, y: number) => void
  onViewportResize?: (width: number, height: number) => void
}

export function CanvasWorkspace({ workspace, renderPane, onActivate, onGeometryChange, onCanvasOffsetChange, onViewportResize }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 })
  const offsetRef = useRef(workspace.canvasOffset)
  offsetRef.current = workspace.canvasOffset
  const onViewportResizeRef = useRef(onViewportResize)
  onViewportResizeRef.current = onViewportResize

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) {
        setViewportSize({ width: r.width, height: r.height })
        onViewportResizeRef.current?.(r.width, r.height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const vpRef = useRef(viewportSize)
  vpRef.current = viewportSize

  const clampOffset = (x: number, y: number) => ({
    x: Math.max(0, Math.min(CANVAS_W - vpRef.current.width, x)),
    y: Math.max(0, Math.min(CANVAS_H - vpRef.current.height, y))
  })

  // Alt+Arrow panning
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const dirs: Record<string, [number, number]> = {
        ArrowLeft: [-PAN_STEP, 0],
        ArrowRight: [PAN_STEP, 0],
        ArrowUp: [0, -PAN_STEP],
        ArrowDown: [0, PAN_STEP]
      }
      const delta = dirs[e.key]
      if (!delta) return
      e.preventDefault()
      const { x, y } = offsetRef.current
      const c = clampOffset(x + delta[0], y + delta[1])
      onCanvasOffsetChange(c.x, c.y)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCanvasOffsetChange])

  // Wheel/trackpad panning (only when the wheel target is the canvas background, not a pane)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.floating-pane')) return
      e.preventDefault()
      const { x, y } = offsetRef.current
      const c = clampOffset(x + e.deltaX, y + e.deltaY)
      onCanvasOffsetChange(c.x, c.y)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [onCanvasOffsetChange])

  const { x: ox, y: oy } = workspace.canvasOffset
  const canvasBounds = { width: CANVAS_W, height: CANVAS_H }

  return (
    <div ref={containerRef} className="canvas-workspace" style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(${-ox}px, ${-oy}px)`,
          willChange: 'transform'
        }}
      >
        {workspace.panes.map((pane) => {
          const snapTargets: SnapRect[] = workspace.panes
            .filter((p) => p.id !== pane.id)
            .map((p) => ({ x: p.x, y: p.y, width: p.width, height: p.height }))
          return (
            <FloatingPane
              key={pane.id}
              x={pane.x}
              y={pane.y}
              width={pane.width}
              height={pane.height}
              bounds={canvasBounds}
              isActive={workspace.activePaneId === pane.id}
              snapTargets={snapTargets}
              onActivate={() => onActivate(pane.id)}
              onGeometryChange={(x, y, w, h) => onGeometryChange(pane.id, x, y, w, h)}
            >
              {renderPane(pane)}
            </FloatingPane>
          )
        })}
      </div>
    </div>
  )
}
