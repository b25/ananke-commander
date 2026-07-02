import { useCallback } from 'react'
import type {
  ApiToolkitPaneState,
  AppStateSnapshot,
  BrowserPaneState,
  FileBrowserPaneState,
  GitUiPaneState,
  NotesPaneState,
  PaneState,
  PaneType,
  RadarPaneState,
  TerminalPaneState,
  WorkspaceState
} from '../../shared/contracts'
import {
  LAYOUTS,
  LAYOUT_SLOTS,
  applyLayout,
  bestLayout,
  fittingLayout,
  nextProgressionLayout
} from '../lib/layouts'
import { paneCol, paneFractionalOffsets, paneOnScreen, paneRow } from '../lib/screenIndex'
import { useStateSync } from './useStateSync'

const MAX_WINDOWS_PER_WORKSPACE = 36
const MAX_PANES_PER_SCREEN = 9 // 9-grid is the maximum layout

type Params = {
  ws: WorkspaceState | undefined
  vpW: number
  vpH: number
  activeScreen: number
  screenCol: number
  screenRow: number
  setSnap: (next: AppStateSnapshot) => void
  /** Surface a transient "can't add pane" warning in the shell. */
  notifyAddError: (message: string) => void
}

/**
 * All workspace/pane/layout mutation callbacks for the app shell. Extracted from App.tsx so the
 * shell component is left with view state + composition. Each callback's logic and dependency
 * set is preserved verbatim from the original inline definitions.
 */
export function useWorkspaceActions({
  ws,
  vpW,
  vpH,
  activeScreen,
  screenCol,
  screenRow,
  setSnap,
  notifyAddError
}: Params) {
  const run = useStateSync(setSnap)

  const setActivePane = useCallback(
    (id: string) => {
      if (!ws) return
      void run(() => window.ananke.state.setActivePane(ws.id, id))
    },
    [ws, run]
  )

  const updatePane = useCallback(
    (paneId: string, next: PaneState) => {
      if (!ws) return
      void run(() => window.ananke.state.updatePane(ws.id, paneId, next))
    },
    [ws, run]
  )

  const closePane = useCallback(
    (paneId: string) => {
      if (!ws) return
      void run(() => window.ananke.state.closePane(ws.id, paneId))
    },
    [ws, run]
  )

  const handleCanvasOffsetChange = useCallback(
    (x: number, y: number) => {
      if (!ws) return
      const sx = Math.max(0, Math.min(vpW, Math.round(x / (vpW || 1)) * vpW))
      const sy = Math.max(0, Math.min(vpH, Math.round(y / (vpH || 1)) * vpH))
      void run(() => window.ananke.state.setCanvasOffset(ws.id, sx, sy))
    },
    [ws, vpW, vpH, run]
  )

  const handleLayoutSelect = useCallback(
    async (layoutId: string) => {
      if (!ws) return
      const layout = LAYOUTS.find((l) => l.id === layoutId)
      if (!layout) return

      const currentCollapsedIds = ws.screenCollapsed?.[activeScreen] ?? []
      const currentCollapsedSet = new Set(currentCollapsedIds)
      const visibleOnScreen = ws.panes.filter(
        (p) => paneOnScreen(p, screenCol, screenRow) && !currentCollapsedSet.has(p.id)
      )
      const newSlots = layout.slots.length
      let newCollapsedIds: string[]

      if (newSlots >= visibleOnScreen.length + currentCollapsedIds.length) {
        newCollapsedIds = []
      } else if (newSlots >= visibleOnScreen.length) {
        const canRestore = newSlots - visibleOnScreen.length
        newCollapsedIds = currentCollapsedIds.slice(canRestore)
      } else {
        const excess = visibleOnScreen.slice(newSlots).map((p) => p.id)
        newCollapsedIds = [...currentCollapsedIds, ...excess]
      }

      // Cap total panes per screen at MAX_PANES_PER_SCREEN: prune oldest collapsed entries
      const maxCollapsed = MAX_PANES_PER_SCREEN - newSlots
      let prunedIds: Set<string> = new Set()
      if (newCollapsedIds.length > maxCollapsed) {
        const toPrune = newCollapsedIds.slice(0, newCollapsedIds.length - maxCollapsed)
        prunedIds = new Set(toPrune)
        newCollapsedIds = newCollapsedIds.slice(newCollapsedIds.length - maxCollapsed)
      }
      const newCollapsedSet = new Set(newCollapsedIds)
      const panesForLayout = ws.panes.filter((p) => !newCollapsedSet.has(p.id) && !prunedIds.has(p.id))
      const arranged = applyLayout(panesForLayout, layout, screenCol, screenRow, vpW, vpH)
      const collapsedPanes = ws.panes.filter((p) => newCollapsedSet.has(p.id))
      const finalPanes = [...arranged, ...collapsedPanes]

      await run(async () => {
        await window.ananke.state.setIntentLayout(ws.id, activeScreen, layoutId)
        await window.ananke.state.setScreenLayout(ws.id, activeScreen, layoutId)
        await window.ananke.state.setScreenCollapsed(ws.id, activeScreen, newCollapsedIds)
        return window.ananke.state.replacePanes(ws.id, finalPanes, ws.activePaneId)
      })
    },
    [ws, screenCol, screenRow, vpW, vpH, activeScreen, run]
  )

  const addPane = useCallback(
    async (type: PaneType, opts?: { cwd?: string }) => {
      if (!ws) return

      // Hard cap across all screens
      if (ws.panes.length >= MAX_WINDOWS_PER_WORKSPACE) {
        notifyAddError('Maximum 36 panes per workspace reached')
        return
      }

      const panesOnScrn = (idx: number): number => {
        const col = idx % 2,
          row = Math.floor(idx / 2)
        const collapsedSet = new Set(ws.screenCollapsed?.[idx] ?? [])
        return ws.panes.filter((p) => paneOnScreen(p, col, row) && !collapsedSet.has(p.id)).length
      }
      const slotsOnScrn = (idx: number): number => LAYOUT_SLOTS[ws.screenLayouts?.[idx] ?? ''] ?? 1

      // Determine target screen and layout
      let tIdx = activeScreen
      let tCol = screenCol
      let tRow = screenRow
      let tLayoutId = ws.screenLayouts?.[tIdx] ?? 'full'

      if (panesOnScrn(tIdx) >= (LAYOUT_SLOTS[tLayoutId] ?? 1)) {
        const nextLId = nextProgressionLayout(tLayoutId)
        if (nextLId) {
          // Advance layout on current screen
          tLayoutId = nextLId
        } else {
          // Try spill to another screen
          const spillIdx = ([0, 1, 2, 3] as const).find(
            (i) => i !== tIdx && panesOnScrn(i) < slotsOnScrn(i)
          )
          if (spillIdx !== undefined) {
            tIdx = spillIdx
            tCol = spillIdx % 2
            tRow = Math.floor(spillIdx / 2)
            tLayoutId = ws.screenLayouts?.[tIdx] ?? 'full'
            await window.ananke.state.setCanvasOffset(ws.id, Math.round(tCol * vpW), Math.round(tRow * vpH))
          } else {
            notifyAddError('Maximum 36 panes per workspace reached')
            return
          }
        }
      }

      const id = crypto.randomUUID()
      const home = await window.ananke.getPath('home')
      const wPct = 0.5,
        hPct = 0.5
      const pxLeft = Math.round(tCol * vpW)
      const pxTop = Math.round(tRow * vpH)
      const w = Math.round((tCol + wPct) * vpW) - pxLeft
      const h = Math.round((tRow + hPct) * vpH) - pxTop
      const base = { id, x: pxLeft, y: pxTop, width: w, height: h, xPct: tCol, yPct: tRow, wPct, hPct }
      let p: PaneState
      if (type === 'file-browser')
        p = {
          ...base,
          type: 'file-browser',
          title: 'Files',
          leftPath: home,
          rightPath: home,
          focusedSide: 'left',
          leftSelection: [],
          rightSelection: []
        } satisfies FileBrowserPaneState
      else if (type === 'terminal')
        p = { ...base, type: 'terminal', title: 'Terminal', cwd: opts?.cwd || home } satisfies TerminalPaneState
      else if (type === 'browser') {
        const jsonPrettyPrint = (() => {
          try {
            const v = localStorage.getItem('ananke.browser.jsonPrettyPrint')
            return v === null ? true : v === '1'
          } catch {
            return true
          }
        })()
        p = { ...base, type: 'browser', title: 'Browser', url: 'about:blank', jsonPrettyPrint } satisfies BrowserPaneState
      } else if (type === 'radar')
        p = { ...base, type: 'radar', title: 'Radar', rootPath: home, pathHistory: [] } satisfies RadarPaneState
      else if (type === 'gitui')
        p = { ...base, type: 'gitui', title: 'GitUI', cwd: opts?.cwd || home } satisfies GitUiPaneState
      else if (type === 'api-toolkit')
        p = { ...base, type: 'api-toolkit', title: 'API Toolkit', cwd: home } satisfies ApiToolkitPaneState
      else p = { ...base, type: 'notes', title: 'Notes', body: '' } satisfies NotesPaneState

      const newPanes = [...ws.panes, p]

      // Explicitly exclude collapsed panes on the target screen from consuming layout slots
      const collapsedSet = new Set(ws.screenCollapsed?.[tIdx] ?? [])
      const panesForLayout = newPanes.filter((q) => !collapsedSet.has(q.id))
      const collapsedPanes = newPanes.filter((q) => collapsedSet.has(q.id))

      const layout =
        LAYOUTS.find((l) => l.id === tLayoutId) ??
        bestLayout(panesForLayout.filter((q) => paneOnScreen(q, tCol, tRow)).length)
      const arranged = applyLayout(panesForLayout, layout, tCol, tRow, vpW, vpH)

      // Recombine arranged (visible) panes with untouched collapsed ones
      const finalPanes = [...arranged, ...collapsedPanes]

      await run(async () => {
        await window.ananke.state.setScreenLayout(ws.id, tIdx, layout.id)
        return window.ananke.state.replacePanes(ws.id, finalPanes, id)
      })
    },
    [ws, vpW, vpH, screenCol, screenRow, activeScreen, run, notifyAddError]
  )

  const applySmartLayouts = useCallback(
    async (newVpW: number, newVpH: number) => {
      if (!ws) return
      let newPanes = ws.panes
      const layoutChanges: Record<number, string> = {}
      const collapsedChanges: Record<number, string[]> = {}

      for (const screenIdx of [0, 1, 2, 3] as const) {
        const col = screenIdx % 2
        const row = Math.floor(screenIdx / 2)
        const hasPanes = newPanes.some((p) => paneOnScreen(p, col, row))
        if (!hasPanes) continue
        const intent = ws.intentLayouts?.[screenIdx] ?? ws.screenLayouts?.[screenIdx] ?? 'full'
        const current = ws.screenLayouts?.[screenIdx] ?? 'full'
        const target = fittingLayout(intent, newVpW, newVpH)
        if (target !== current) {
          const layout = LAYOUTS.find((l) => l.id === target)!
          layoutChanges[screenIdx] = target

          // Collapse excess panes when downgrading to a layout with fewer slots
          const existingCollapsed = ws.screenCollapsed?.[screenIdx] ?? []
          const existingCollapsedSet = new Set(existingCollapsed)
          const visibleOnScreen = newPanes.filter(
            (p) => paneOnScreen(p, col, row) && !existingCollapsedSet.has(p.id)
          )
          let newCollapsed = existingCollapsed
          if (layout.slots.length < visibleOnScreen.length) {
            const excess = visibleOnScreen.slice(layout.slots.length).map((p) => p.id)
            newCollapsed = [...existingCollapsed, ...excess]
          }

          // Cap total panes per screen at MAX_PANES_PER_SCREEN: prune oldest collapsed entries
          const maxCollapsed = MAX_PANES_PER_SCREEN - layout.slots.length
          let smartPruned: Set<string> = new Set()
          if (newCollapsed.length > maxCollapsed) {
            const toPrune = newCollapsed.slice(0, newCollapsed.length - maxCollapsed)
            smartPruned = new Set(toPrune)
            newCollapsed = newCollapsed.slice(newCollapsed.length - maxCollapsed)
          }
          collapsedChanges[screenIdx] = newCollapsed

          const newCollapsedSet = new Set(newCollapsed)
          const toArrange = newPanes.filter(
            (p) => !(paneOnScreen(p, col, row) && (newCollapsedSet.has(p.id) || smartPruned.has(p.id)))
          )
          const toCollapse = newPanes.filter((p) => paneOnScreen(p, col, row) && newCollapsedSet.has(p.id))
          newPanes = [...applyLayout(toArrange, layout, col, row, newVpW, newVpH), ...toCollapse]
        }
      }

      if (Object.keys(layoutChanges).length === 0) return
      await run(async () => {
        for (const [idx, layoutId] of Object.entries(layoutChanges)) {
          await window.ananke.state.setScreenLayout(ws.id, Number(idx), layoutId)
        }
        for (const [idx, ids] of Object.entries(collapsedChanges)) {
          await window.ananke.state.setScreenCollapsed(ws.id, Number(idx), ids)
        }
        return window.ananke.state.replacePanes(ws.id, newPanes, ws.activePaneId)
      })
    },
    [ws, run]
  )

  const handleRestorePane = useCallback(
    async (collapsedPaneId: string) => {
      if (!ws) return
      const currentCollapsedIds = ws.screenCollapsed?.[activeScreen] ?? []
      const visibleOnScreen = ws.panes.filter(
        (p) => paneOnScreen(p, screenCol, screenRow) && !currentCollapsedIds.includes(p.id)
      )
      const target = visibleOnScreen.find((p) => p.id === ws.activePaneId) ?? visibleOnScreen[0]
      const newCollapsed = currentCollapsedIds.filter((id) => id !== collapsedPaneId)

      if (!target) {
        await run(async () => {
          await window.ananke.state.setScreenCollapsed(ws.id, activeScreen, newCollapsed)
          return window.ananke.state.replacePanes(ws.id, ws.panes, ws.activePaneId)
        })
        return
      }

      const newPanes = ws.panes.map((p) => {
        if (p.id !== collapsedPaneId) return p
        return {
          ...p,
          xPct: target.xPct,
          yPct: target.yPct,
          wPct: target.wPct,
          hPct: target.hPct,
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height
        }
      })
      await run(async () => {
        await window.ananke.state.setScreenCollapsed(ws.id, activeScreen, [
          ...newCollapsed.filter((id) => id !== target.id),
          target.id
        ])
        return window.ananke.state.replacePanes(ws.id, newPanes, collapsedPaneId)
      })
    },
    [ws, screenCol, screenRow, activeScreen, run]
  )

  const handleCloseCollapsed = useCallback(
    async (collapsedPaneId: string) => {
      if (!ws) return
      const newCollapsed = (ws.screenCollapsed?.[activeScreen] ?? []).filter((id) => id !== collapsedPaneId)
      await run(async () => {
        await window.ananke.state.setScreenCollapsed(ws.id, activeScreen, newCollapsed)
        return window.ananke.state.closePane(ws.id, collapsedPaneId)
      })
    },
    [ws, activeScreen, run]
  )

  const repairWorkspace = useCallback(async () => {
    if (!ws) return
    const VALID_COLS = [0, 1],
      VALID_ROWS = [0, 1]
    let panes = [...ws.panes]

    // Move orphaned panes (outside 2×2 grid) onto the active screen
    panes = panes.map((p) => {
      const col = paneCol(p)
      const row = paneRow(p)
      if (VALID_COLS.includes(col) && VALID_ROWS.includes(row)) return p
      const { xFrac, yFrac } = paneFractionalOffsets(p)
      return { ...p, xPct: screenCol + xFrac, yPct: screenRow + yFrac }
    })

    // Close each collapsed pane through the state layer so they enter Recently Closed (restorable).
    // Previously used replacePanes to silently drop them, which bypassed Recently Closed entirely.
    const allCollapsedIds = new Set(Object.values(ws.screenCollapsed ?? {}).flat())
    for (const paneId of allCollapsedIds) {
      await window.ananke.state.closePane(ws.id, paneId)
    }
    // Remove victims from the local working set used for layout repair below
    panes = panes.filter((p) => !allCollapsedIds.has(p.id))

    // For each screen: fit layout to actual pane count and re-arrange
    for (const screenIdx of [0, 1, 2, 3] as const) {
      const col = screenIdx % 2,
        row = Math.floor(screenIdx / 2)
      const onScreen = panes.filter((p) => paneOnScreen(p, col, row))
      if (onScreen.length === 0) continue
      const layout = bestLayout(onScreen.length)
      panes = applyLayout(panes, layout, col, row, vpW, vpH)
      await window.ananke.state.setScreenCollapsed(ws.id, screenIdx, [])
      await window.ananke.state.setScreenLayout(ws.id, screenIdx, layout.id)
      await window.ananke.state.setIntentLayout(ws.id, screenIdx, layout.id)
    }

    await run(() => window.ananke.state.replacePanes(ws.id, panes, ws.activePaneId))
  }, [ws, screenCol, screenRow, vpW, vpH, run])

  return {
    setActivePane,
    updatePane,
    closePane,
    handleCanvasOffsetChange,
    handleLayoutSelect,
    addPane,
    applySmartLayouts,
    handleRestorePane,
    handleCloseCollapsed,
    repairWorkspace
  }
}
