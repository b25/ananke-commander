import { useEffect, useRef, useState } from 'react'
import type { PaneState, WorkspaceState } from '../../shared/contracts'
import { FloatingPane, type SnapRect } from './FloatingPane'

interface Props {
  workspace: WorkspaceState
  renderPane: (pane: PaneState) => React.ReactNode
  onActivate: (paneId: string) => void
  onGeometryChange: (paneId: string, x: number, y: number, w: number, h: number) => void
  onCanvasOffsetChange: (x: number, y: number) => void
  onViewportResize?: (width: number, height: number) => void
}

export function CanvasWorkspace({
  workspace, renderPane, onActivate, onGeometryChange, onCanvasOffsetChange, onViewportResize
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 })
  const offsetRef = useRef(workspace.canvasOffset)
  offsetRef.current = workspace.canvasOffset
  const onViewportResizeRef = useRef(onViewportResize)
  onViewportResizeRef.current = onViewportResize
  const vpRef = useRef(viewportSize)
  vpRef.current = viewportSize

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      setViewportSize({ width: r.width, height: r.height })
      onViewportResizeRef.current?.(r.width, r.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Alt+Arrow: jump between screens (one viewport step each)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const { width: vpW, height: vpH } = vpRef.current
      const { x, y } = offsetRef.current
      const steps: Record<string, [number, number]> = {
        ArrowLeft:  [-vpW, 0],
        ArrowRight: [ vpW, 0],
        ArrowUp:    [0, -vpH],
        ArrowDown:  [0,  vpH]
      }
      const delta = steps[e.key]
      if (!delta) return
      e.preventDefault()
      // Snap to valid screen positions: x ∈ {0, vpW}, y ∈ {0, vpH}
      const nx = Math.max(0, Math.min(vpW, x + delta[0]))
      const ny = Math.max(0, Math.min(vpH, y + delta[1]))
      onCanvasOffsetChange(nx, ny)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCanvasOffsetChange])

  const { x: ox, y: oy } = workspace.canvasOffset
  const canvasW = viewportSize.width * 2
  const canvasH = viewportSize.height * 2
  const canvasBounds = { width: canvasW, height: canvasH }

  return (
    <div ref={containerRef} className="canvas-workspace">
      <div
        style={{
          position: 'absolute',
          width: canvasW,
          height: canvasH,
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
