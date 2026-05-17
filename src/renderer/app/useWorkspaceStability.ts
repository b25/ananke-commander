import { useEffect, useRef } from 'react'
import type { AppStateSnapshot, WorkspaceState } from '../../shared/contracts'
import { LAYOUT_SLOTS, applyLayout, bestLayout } from '../lib/layouts'
import { paneOnScreen, screenIndexToColRow } from '../lib/screenIndex'

type Params = {
  snap: AppStateSnapshot | null
  setSnap: (next: AppStateSnapshot) => void
  ws: WorkspaceState | undefined
  vpW: number
  vpH: number
}

export function useWorkspaceStability({ snap, setSnap, ws, vpW, vpH }: Params): void {
  useEffect(() => {
    if (!snap || snap.workspaces.length === 0) return
    const activeExists = snap.workspaces.some((w) => w.id === snap.activeWorkspaceId)
    if (!activeExists) {
      void window.ananke.state.setActiveWorkspace(snap.workspaces[0].id).then(setSnap)
    }
  }, [snap, setSnap])

  const pruneRan = useRef<string | null>(null)
  const latestWsIdRef = useRef<string | null>(null)
  const pruneSeqRef = useRef(0)
  const canvasSeqRef = useRef(0)
  latestWsIdRef.current = ws?.id ?? null

  useEffect(() => {
    if (!ws || pruneRan.current === ws.id) return
    let needsFix = false
    const allCollapsedIds = new Set(Object.values(ws.screenCollapsed ?? {}).flat())
    if (allCollapsedIds.size > 0) needsFix = true
    if (!needsFix) {
      for (const screenIdx of [0, 1, 2, 3] as const) {
        const { col, row } = screenIndexToColRow(screenIdx)
        const onScreen = ws.panes.filter((p) => paneOnScreen(p, col, row)).length
        const layoutId = ws.screenLayouts?.[screenIdx] ?? 'full'
        const slots = LAYOUT_SLOTS[layoutId] ?? 1
        if (onScreen > 0 && onScreen < slots) { needsFix = true; break }
      }
    }
    if (!needsFix) { pruneRan.current = ws.id; return }
    pruneRan.current = ws.id
    const seq = ++pruneSeqRef.current
    const wsId = ws.id
    void (async () => {
      let panes = ws.panes.filter(p => !allCollapsedIds.has(p.id))
      for (const screenIdx of [0, 1, 2, 3] as const) {
        if (pruneSeqRef.current !== seq || latestWsIdRef.current !== wsId) return
        const { col, row } = screenIndexToColRow(screenIdx)
        const onScreen = panes.filter((p) => paneOnScreen(p, col, row))
        if (onScreen.length === 0) continue
        const layout = bestLayout(onScreen.length)
        panes = applyLayout(panes, layout, col, row, vpW, vpH)
        await window.ananke.state.setScreenCollapsed(wsId, screenIdx, [])
        await window.ananke.state.setScreenLayout(wsId, screenIdx, layout.id)
        await window.ananke.state.setIntentLayout(wsId, screenIdx, layout.id)
      }
      if (pruneSeqRef.current !== seq || latestWsIdRef.current !== wsId) return
      setSnap(await window.ananke.state.replacePanes(wsId, panes, ws.activePaneId))
    })()
  }, [ws, vpW, vpH, setSnap])

  const canvasSnapRan = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!ws || !vpW || !vpH) return
    const wsId = ws.id
    const key = `${ws.id}:${ws.canvasOffset.x}:${ws.canvasOffset.y}:${vpW}:${vpH}`
    if (canvasSnapRan.current.has(key)) return
    canvasSnapRan.current.add(key)
    const snappedX = Math.max(0, Math.min(vpW, Math.round(ws.canvasOffset.x / vpW) * vpW))
    const snappedY = Math.max(0, Math.min(vpH, Math.round(ws.canvasOffset.y / vpH) * vpH))
    if (snappedX !== ws.canvasOffset.x || snappedY !== ws.canvasOffset.y) {
      const seq = ++canvasSeqRef.current
      void window.ananke.state.setCanvasOffset(wsId, snappedX, snappedY).then((nextSnap) => {
        if (canvasSeqRef.current !== seq || latestWsIdRef.current !== wsId) return
        setSnap(nextSnap)
      })
    }
  }, [ws, vpW, vpH, setSnap])
}
