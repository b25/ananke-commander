import { useEffect, useRef, useState } from 'react'

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface SnapRect { x: number; y: number; width: number; height: number }

interface Bounds { width: number; height: number }

interface Props {
  x: number
  y: number
  width: number
  height: number
  isActive: boolean
  bounds: Bounds
  snapTargets: SnapRect[]
  onActivate: () => void
  onGeometryChange: (x: number, y: number, w: number, h: number) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  children: React.ReactNode
}

const MIN_W = 300
const MIN_H = 200
const SNAP = 50
const GAP = 12

/** Return v snapped to the nearest candidate within SNAP distance, else v. */
function snap(v: number, candidates: number[]): number {
  for (const c of candidates) {
    if (Math.abs(v - c) <= SNAP) return c
  }
  return v
}

/** Snap a dragged pane's (x, y) to target edges. */
function snapDrag(nx: number, ny: number, w: number, h: number, targets: SnapRect[]) {
  let x = nx
  let y = ny
  for (const t of targets) {
    x = snap(x, [t.x, t.x + t.width + GAP, t.x - w - GAP, t.x + t.width - w])
    y = snap(y, [t.y, t.y + t.height + GAP, t.y - h - GAP, t.y + t.height - h])
  }
  return { x, y }
}

/** Snap a resize result's moving edges to target edges. */
function snapResize(
  dir: ResizeDir,
  nx: number, ny: number, nw: number, nh: number,
  targets: SnapRect[]
): { x: number; y: number; width: number; height: number } {
  let x = nx, y = ny, w = nw, h = nh
  for (const t of targets) {
    if (dir.includes('e')) {
      const snapped = snap(x + w, [t.x - GAP, t.x + t.width])
      w = Math.max(MIN_W, snapped - x)
    }
    if (dir.includes('s')) {
      const snapped = snap(y + h, [t.y - GAP, t.y + t.height])
      h = Math.max(MIN_H, snapped - y)
    }
    if (dir.includes('w')) {
      const snapped = snap(x, [t.x + t.width + GAP, t.x])
      const newW = Math.max(MIN_W, (x + w) - snapped)
      x = (x + w) - newW
      w = newW
    }
    if (dir.includes('n')) {
      const snapped = snap(y, [t.y + t.height + GAP, t.y])
      const newH = Math.max(MIN_H, (y + h) - snapped)
      y = (y + h) - newH
      h = newH
    }
  }
  return { x, y, width: w, height: h }
}

function clampGeo(
  cx: number, cy: number, cw: number, ch: number,
  b: Bounds
): { x: number; y: number; width: number; height: number } {
  const w = Math.min(cw, b.width)
  const h = Math.min(ch, b.height)
  const x = Math.max(0, Math.min(cx, b.width - w))
  const y = Math.max(0, Math.min(cy, b.height - h))
  return { x, y, width: w, height: h }
}

export function FloatingPane({
  x, y, width, height,
  isActive, bounds, snapTargets,
  onActivate, onGeometryChange, onDragStart, onDragEnd, children
}: Props) {
  const [liveGeo, setLiveGeo] = useState({ x, y, width, height })
  const [isMaximized, setIsMaximized] = useState(false)
  const preMaxGeoRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null)
  const draggingRef = useRef(false)
  const snapRef = useRef(snapTargets)
  snapRef.current = snapTargets
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds

  useEffect(() => {
    if (!draggingRef.current) setLiveGeo({ x, y, width, height })
  }, [x, y, width, height])

  const displayGeo = isMaximized
    ? { x: 0, y: 0, width: bounds.width, height: bounds.height }
    : liveGeo

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    onActivate()
    onDragStart?.()
    draggingRef.current = true
    const startMx = e.clientX
    const startMy = e.clientY
    const startGeo = { x: liveGeo.x, y: liveGeo.y, width: liveGeo.width, height: liveGeo.height }

    const compute = (ev: MouseEvent) => {
      const rawX = startGeo.x + ev.clientX - startMx
      const rawY = startGeo.y + ev.clientY - startMy
      const { x: sx, y: sy } = snapDrag(rawX, rawY, startGeo.width, startGeo.height, snapRef.current)
      const { x: cx, y: cy } = clampGeo(sx, sy, startGeo.width, startGeo.height, boundsRef.current)
      return { x: cx, y: cy }
    }

    const onMove = (ev: MouseEvent) => {
      const { x: nx, y: ny } = compute(ev)
      setLiveGeo((g) => ({ ...g, x: nx, y: ny }))
    }
    const onUp = (ev: MouseEvent) => {
      draggingRef.current = false
      const { x: nx, y: ny } = compute(ev)
      onGeometryChange(nx, ny, startGeo.width, startGeo.height)
      onDragEnd?.()
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const startResize = (dir: ResizeDir) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onActivate()
    onDragStart?.()
    draggingRef.current = true
    const startMx = e.clientX
    const startMy = e.clientY
    const startGeo = { x: liveGeo.x, y: liveGeo.y, width: liveGeo.width, height: liveGeo.height }

    const compute = (ev: MouseEvent) => {
      const dx = ev.clientX - startMx
      const dy = ev.clientY - startMy
      let { x: nx, y: ny, width: nw, height: nh } = startGeo
      if (dir.includes('e')) nw = Math.max(MIN_W, nw + dx)
      if (dir.includes('s')) nh = Math.max(MIN_H, nh + dy)
      if (dir.includes('w')) {
        const cw = Math.max(MIN_W, nw - dx)
        nx = cw > MIN_W ? nx + dx : nx + nw - MIN_W
        nw = cw
      }
      if (dir.includes('n')) {
        const ch = Math.max(MIN_H, nh - dy)
        ny = ch > MIN_H ? ny + dy : ny + nh - MIN_H
        nh = ch
      }
      const snapped = snapResize(dir, nx, ny, nw, nh, snapRef.current)
      return clampGeo(snapped.x, snapped.y, snapped.width, snapped.height, boundsRef.current)
    }

    const onMove = (ev: MouseEvent) => setLiveGeo(compute(ev))
    const onUp = (ev: MouseEvent) => {
      draggingRef.current = false
      const g = compute(ev)
      onGeometryChange(g.x, g.y, g.width, g.height)
      onDragEnd?.()
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    onActivate()
    const target = e.target as HTMLElement
    const onHeader = target.closest('.pane-header') !== null
    const onButton = target.closest('button') !== null || target.closest('a') !== null
    if (onHeader && !onButton) {
      if (e.detail === 2) {
        // double-click: toggle maximize
        if (!isMaximized) {
          preMaxGeoRef.current = { ...liveGeo }
        } else if (preMaxGeoRef.current) {
          setLiveGeo(preMaxGeoRef.current)
        }
        setIsMaximized(m => !m)
        return
      }
      if (!isMaximized) startDrag(e)
    }
  }

  return (
    <div
      className={`floating-pane${isActive ? ' active' : ''}`}
      style={{
        position: 'absolute',
        left: displayGeo.x,
        top: displayGeo.y,
        width: displayGeo.width,
        height: displayGeo.height,
        zIndex: isActive ? 10 : 1
      }}
      onMouseDown={handleMouseDown}
    >
      {children}
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDir[]).map((dir) => (
        <div
          key={dir}
          className={`fp-resize fp-resize--${dir}`}
          onMouseDown={startResize(dir)}
        />
      ))}
    </div>
  )
}
