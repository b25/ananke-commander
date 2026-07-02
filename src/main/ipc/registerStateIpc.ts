import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { IPC_LIMITS } from './ipcLimits.js'
import type { StateStore } from '../store/stateStore.js'
import type { BrowserPaneManager } from '../browser/browserPaneManager.js'
import type { TerminalManager } from '../pty/terminalManager.js'
import type { AppStateSnapshot, PaneState, RecentlyClosedEntry } from '../../shared/contracts.js'

type RegisterStateIpcDeps = {
  getStateStore: () => StateStore
  getBrowserPanes: () => BrowserPaneManager
  getBrowserPanesIfActive: () => BrowserPaneManager | null
  getTerminals: () => TerminalManager
}

export function registerStateIpcHandlers(deps: RegisterStateIpcDeps): void {
  const { getStateStore, getBrowserPanes, getBrowserPanesIfActive, getTerminals } = deps

  // ── Full-snapshot reads (initial hydration & RC-mutating handlers) ───────────────────────────
  // These return getSnapshot() which includes recentlyClosed. Keep them full so the renderer
  // always has an up-to-date list after operations that actually change recentlyClosed.

  ipcMain.handle('state:get', (): AppStateSnapshot => getStateStore().getSnapshot())

  // Dedicated lean fetch — renderer calls this when the Recently Closed drawer opens.
  ipcMain.handle('state:getRecentlyClosed', (): RecentlyClosedEntry[] =>
    getStateStore().getRecentlyClosed()
  )

  ipcMain.handle('state:closePane', (_e, workspaceId: string, paneId: string) => {
    const ws = getStateStore().getWorkspace(workspaceId)
    if (!ws) return getStateStore().getSnapshot()
    const pane = ws.panes.find((p) => p.id === paneId)
    const panes = ws.panes.filter((p) => p.id !== paneId)
    const active = ws.activePaneId === paneId ? (panes[0]?.id ?? null) : ws.activePaneId
    if (pane && !getStateStore().getSettings().privacy.privateMode) {
      const max = getStateStore().getSettings().privacy.recentlyClosedMax
      getStateStore().pushRecentlyClosed(
        { id: randomUUID(), closedAt: Date.now(), snapshot: structuredClone(pane) },
        max
      )
    }
    if (pane?.type === 'terminal' || pane?.type === 'gitui') getTerminals().dispose(paneId)
    if (pane?.type === 'browser') getBrowserPanes().destroy(paneId)
    getStateStore().replaceWorkspacePanes(workspaceId, panes, active)
    getStateStore().flushToml()
    return getStateStore().getSnapshot()  // full — RC list now has a new entry
  })

  ipcMain.handle('state:removeRecentlyClosed', (_e, entryId: string) => {
    getStateStore().removeRecentlyClosed(entryId)
    return getStateStore().getSnapshot()  // full — RC list was modified
  })

  ipcMain.handle('state:purgeRecentlyClosed', () => {
    getStateStore().purgeRecentlyClosed()
    return getStateStore().getSnapshot()  // full — RC list now empty
  })

  ipcMain.handle('state:restoreClosed', (_e, workspaceId: string, entryId: string) => {
    const snap = getStateStore().getSnapshot()
    const entry = snap.recentlyClosed.find((e) => e.id === entryId)
    if (!entry) return snap
    const ws = getStateStore().getWorkspace(workspaceId)
    if (!ws) return snap
    const panes = [...ws.panes, structuredClone(entry.snapshot)]
    getStateStore().removeRecentlyClosed(entryId)
    getStateStore().replaceWorkspacePanes(workspaceId, panes, entry.snapshot.id)
    return getStateStore().getSnapshot()  // full — RC list has one fewer entry
  })

  // ── Lean-snapshot mutation handlers (PERF-5 / Task 19) ───────────────────────────────────────
  // High-frequency mutations that do NOT touch recentlyClosed return getLeanSnapshot() —
  // omitting the up-to-50 structuredCloned pane entries from every IPC round-trip.
  // The renderer preserves its local recentlyClosed across these lean responses (see App.tsx).

  ipcMain.handle('state:set', (_e, patch: Partial<AppStateSnapshot>) => {
    const estimate = JSON.stringify(patch).length
    if (estimate > IPC_LIMITS.stateSetJsonEstimate) {
      throw new Error(`state:set patch too large (${estimate} bytes)`)
    }
    getStateStore().setSnapshot(patch)
    getStateStore().applyRecentlyClosedRetention()
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:replacePanes', (_e, wsId: string, panes: PaneState[], activeId: string | null) => {
    getStateStore().replaceWorkspacePanes(wsId, panes, activeId)
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:addWorkspace', (_e, name: string) => {
    const ws = getStateStore().addWorkspace(name)
    getStateStore().setActiveWorkspace(ws.id)
    getStateStore().flushToml()
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:setActiveWorkspace', (_e, id: string) => {
    getStateStore().setActiveWorkspace(id)
    // Park any browser views that belong to other workspaces offscreen so they can never
    // bleed on-screen over the active workspace (views are kept alive to preserve page state).
    const ws = getStateStore().getWorkspace(id)
    const browserPanes = getBrowserPanesIfActive()
    if (ws && browserPanes) browserPanes.suspendAllExcept(ws.panes.map((p) => p.id))
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:setActivePane', (_e, workspaceId: string, paneId: string) => {
    getStateStore().setActiveWorkspacePane(workspaceId, paneId)
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:updatePane', (_e, workspaceId: string, paneId: string, next: PaneState) => {
    getStateStore().updatePane(workspaceId, paneId, () => next)
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:setCanvasOffset', (_e, wsId: string, x: number, y: number) => {
    getStateStore().setCanvasOffset(wsId, x, y)
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:setScreenLayout', (_e, wsId: string, screenIndex: number, layoutId: string) => {
    getStateStore().setScreenLayout(wsId, screenIndex, layoutId)
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:setIntentLayout', (_e, wsId: string, screenIndex: number, layoutId: string) => {
    getStateStore().setIntentLayout(wsId, screenIndex, layoutId)
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:setScreenCollapsed', (_e, wsId: string, screenIndex: number, ids: string[]) => {
    getStateStore().setScreenCollapsed(wsId, screenIndex, ids)
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:cloneWorkspace', (_e, wsId: string) => {
    const ws = getStateStore().cloneWorkspace(wsId)
    if (ws) getStateStore().setActiveWorkspace(ws.id)
    getStateStore().flushToml()
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:renameWorkspace', (_e, wsId: string, name: string) => {
    getStateStore().renameWorkspace(wsId, name)
    getStateStore().flushToml()
    return getStateStore().getLeanSnapshot()
  })

  ipcMain.handle('state:deleteWorkspace', (_e, wsId: string) => {
    getStateStore().deleteWorkspace(wsId)
    getStateStore().flushToml()
    return getStateStore().getLeanSnapshot()
  })
}
