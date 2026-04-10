import { useEffect, useRef, useState } from 'react'
import type { PaneState, WorkspaceState } from '../../shared/contracts'
import { FloatingPane } from './FloatingPane'

interface Props {
  workspace: WorkspaceState
  renderPane: (pane: PaneState) => React.ReactNode
  onActivate: (paneId: string) => void
  onCanvasOffsetChange: (x: number, y: number) => void
  onViewportResize?: (width: number, height: number) => void
}

export function CanvasWorkspace({ workspace, renderPane, onActivate, onCanvasOffsetChange, onViewportResize }: Props) {
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
    let timer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        setViewportSize({ width: r.width, height: r.height })
        onViewportResizeRef.current?.(r.width, r.height)
      }, 16)
    })
    ro.observe(el)
    return () => { ro.disconnect(); if (timer) clearTimeout(timer) }
  }, [])

  // Alt+Arrow: jump one screen at a time
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const { width: vpW, height: vpH } = vpRef.current
      const { x, y } = offsetRef.current
      const steps: Record<string, [number, number]> = {
        ArrowLeft: [-vpW, 0], ArrowRight: [vpW, 0],
        ArrowUp: [0, -vpH],   ArrowDown: [0, vpH]
      }
      const delta = steps[e.key]
      if (!delta) return
      e.preventDefault()
      onCanvasOffsetChange(
        Math.max(0, Math.min(vpW, x + delta[0])),
        Math.max(0, Math.min(vpH, y + delta[1]))
      )
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCanvasOffsetChange])

  const { x: ox, y: oy } = workspace.canvasOffset
  const canvasW = viewportSize.width * 2
  const canvasH = viewportSize.height * 2

  return (
    <div ref={containerRef} className="canvas-workspace">
      <div style={{ position: 'absolute', width: canvasW, height: canvasH, transform: `translate(${-ox}px, ${-oy}px)`, willChange: 'transform' }}>
        {workspace.panes.map((pane) => (
          <FloatingPane
            key={pane.id}
            x={pane.x} y={pane.y} width={pane.width} height={pane.height}
            isActive={workspace.activePaneId === pane.id}
            onActivate={() => onActivate(pane.id)}
          >
            {renderPane(pane)}
          </FloatingPane>
        ))}
      </div>
    </div>
  )
}
