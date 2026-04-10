import { useRef } from 'react'
import type { WorkspaceState } from '../../shared/contracts'
import { CANVAS_W, CANVAS_H } from './CanvasWorkspace'

interface Props {
  workspace: WorkspaceState
  viewportWidth: number
  viewportHeight: number
  onPan: (x: number, y: number) => void
}

const MINIMAP_W = 220
const MINIMAP_H = 160

const PANE_COLORS: Record<string, string> = {
  'file-browser': '#4e7fff',
  'terminal': '#2dca73',
  'browser': '#ff7b3d',
  'notes': '#ffd700',
  'radar': '#c678dd'
}

export function RadarMinimap({ workspace, viewportWidth, viewportHeight, onPan }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { canvasOffset } = workspace
  const scaleX = MINIMAP_W / CANVAS_W
  const scaleY = MINIMAP_H / CANVAS_H

  const isDragging = useRef(false)

  const panToPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    const canvasX = mx / scaleX - viewportWidth / 2
    const canvasY = my / scaleY - viewportHeight / 2
    onPan(
      Math.max(0, Math.min(CANVAS_W - viewportWidth, canvasX)),
      Math.max(0, Math.min(CANVAS_H - viewportHeight, canvasY))
    )
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    isDragging.current = true
    panToPoint(e.clientX, e.clientY)

    const onMove = (ev: MouseEvent) => {
      if (isDragging.current) panToPoint(ev.clientX, ev.clientY)
    }
    const onUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const vpX = canvasOffset.x * scaleX
  const vpY = canvasOffset.y * scaleY
  const vpW = Math.min(MINIMAP_W, viewportWidth * scaleX)
  const vpH = Math.min(MINIMAP_H, viewportHeight * scaleY)

  return (
    <div className="radar-minimap">
      <div className="radar-minimap__label">Radar</div>
      <svg
        ref={svgRef}
        width={MINIMAP_W}
        height={MINIMAP_H}
        onMouseDown={handleMouseDown}
        style={{ cursor: 'crosshair', display: 'block' }}
      >
        <rect width={MINIMAP_W} height={MINIMAP_H} fill="var(--bg)" />
        {workspace.panes.map((pane) => (
          <rect
            key={pane.id}
            x={Math.max(0, pane.x * scaleX)}
            y={Math.max(0, pane.y * scaleY)}
            width={Math.max(2, pane.width * scaleX)}
            height={Math.max(2, pane.height * scaleY)}
            fill={PANE_COLORS[pane.type] ?? '#888'}
            opacity={pane.id === workspace.activePaneId ? 1 : 0.65}
            stroke={pane.id === workspace.activePaneId ? '#ffffff' : 'none'}
            strokeWidth={1}
            rx={1}
          />
        ))}
        <rect
          x={vpX}
          y={vpY}
          width={vpW}
          height={vpH}
          fill="none"
          stroke="#22ff88"
          strokeWidth={1.5}
          opacity={0.85}
        />
      </svg>
    </div>
  )
}
