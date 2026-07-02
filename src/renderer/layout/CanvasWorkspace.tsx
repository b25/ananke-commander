import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaneState, PaneType, WorkspaceState } from '../../shared/contracts'
import { offsetToScreenIndex, paneScreenIndex } from '../lib/screenIndex'
import { shouldMountPaneContent } from '../lib/shouldMountPane'
import { FloatingPane } from './FloatingPane'
import { NewPanePicker } from './NewPanePicker'
import { PanePlaceholder } from './PanePlaceholder'
import { TaskbarStrip } from './TaskbarStrip'

interface Props {
  workspace: WorkspaceState
  renderPane: (pane: PaneState) => React.ReactNode
  onActivate: (paneId: string) => void
  onCanvasOffsetChange: (x: number, y: number) => void
  onViewportResize?: (width: number, height: number) => void
  allPanes?: PaneState[]
  collapsedIds?: string[]
  onRestorePane?: (paneId: string) => void
  onCloseCollapsed?: (paneId: string) => void
  onAddPane?: (type: PaneType) => void
}

export function CanvasWorkspace({ workspace, renderPane, onActivate, onCanvasOffsetChange, onViewportResize, allPanes = [], collapsedIds = [], onRestorePane, onCloseCollapsed, onAddPane }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 })
  const offsetRef = useRef(workspace.canvasOffset)
  offsetRef.current = workspace.canvasOffset
  const onViewportResizeRef = useRef(onViewportResize)
  onViewportResizeRef.current = onViewportResize
  const vpRef = useRef(viewportSize)
  vpRef.current = viewportSize
  const warmedPaneIdsRef = useRef(new Set<string>())

  const activatePane = useCallback(
    (paneId: string) => {
      warmedPaneIdsRef.current.add(paneId)
      onActivate(paneId)
    },
    [onActivate]
  )

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

  // Alt+Arrow: jump one screen at a time.
  // Pass raw new offset — handleCanvasOffsetChange in App.tsx owns clamping+snapping.
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
      onCanvasOffsetChange(x + delta[0], y + delta[1])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCanvasOffsetChange])

  const { x: ox, y: oy } = workspace.canvasOffset
  const canvasW = viewportSize.width * 2
  const canvasH = viewportSize.height * 2

  const visibleScreen = offsetToScreenIndex(
    workspace.canvasOffset,
    viewportSize.width,
    viewportSize.height
  )
  const screenCol = visibleScreen % 2
  const screenRow = Math.floor(visibleScreen / 2)

  useEffect(() => {
    warmedPaneIdsRef.current.clear()
  }, [visibleScreen])

  const screenPanes = (allPanes ?? []).filter((p) => paneScreenIndex(p) === visibleScreen)

  return (
    <div className="canvas-workspace">
      <TaskbarStrip
        panes={screenPanes}
        activePaneId={workspace.activePaneId}
        collapsedIds={collapsedIds ?? []}
        onRestore={(id) => onRestorePane?.(id)}
        onActivate={activatePane}
        onClose={(id) => onCloseCollapsed?.(id)}
      />
      <div ref={containerRef} className="canvas-panning-area" onScroll={(e) => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0 }}>
        {screenPanes.length === 0 && onAddPane && (
          <div className="empty-screen-cta" aria-label="Empty screen — add a pane to get started">
            <div className="empty-screen-cta__icon" aria-hidden>⬜</div>
            <p className="empty-screen-cta__heading">This screen is empty</p>
            <p className="empty-screen-cta__sub">Choose a pane type to get started</p>
            <NewPanePicker onSelect={onAddPane} />
          </div>
        )}
        <div style={{ position: 'absolute', top: 0, left: 0, width: canvasW, height: canvasH, transform: `translate(${-ox}px, ${-oy}px)`, willChange: 'transform' }}>
          {workspace.panes.map((pane) => {
            const mountCtx = {
              visibleScreenIndex: visibleScreen,
              collapsedIds,
              activePaneId: workspace.activePaneId,
              canvasOffset: workspace.canvasOffset,
              vpW: viewportSize.width,
              vpH: viewportSize.height
            }
            const mountFull = shouldMountPaneContent(pane, mountCtx, warmedPaneIdsRef.current)
            const placeholderReason =
              paneScreenIndex(pane) !== visibleScreen ? 'off-screen' as const : 'suspended' as const
            return (
              <FloatingPane
                key={pane.id}
                x={pane.x}
                y={pane.y}
                width={pane.width}
                height={pane.height}
                isActive={workspace.activePaneId === pane.id}
                isCollapsed={collapsedIds.includes(pane.id)}
                ariaLabel={`${pane.title} pane`}
                onActivate={() => activatePane(pane.id)}
              >
                {mountFull ? renderPane(pane) : <PanePlaceholder pane={pane} reason={placeholderReason} />}
              </FloatingPane>
            )
          })}
        </div>
      </div>
    </div>
  )
}
