import { app } from 'electron'
import Store from 'electron-store'
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  AppSettings,
  AppStateSnapshot,
  PaneState,
  PaneType,
  RecentlyClosedEntry,
  WorkspaceState
} from '../../shared/contracts.js'
import { DEFAULT_SETTINGS } from '../../shared/contracts.js'

// Fallback viewport used only when migrating panes that lack fraction fields.
// Actual fractions are recomputed in the renderer from the live viewport.
const FALLBACK_VP_W = 1440
const FALLBACK_VP_H = 900

const DEFAULT_PANE_SIZES: Record<PaneType, { w: number; h: number }> = {
  'file-browser': { w: 720, h: 450 },
  'terminal':     { w: 720, h: 450 },
  'browser':      { w: 720, h: 450 },
  'notes':        { w: 720, h: 450 },
  'radar':        { w: 720, h: 450 }
}

function injectPaneGeometry(panes: PaneState[]): PaneState[] {
  return panes.map((pane, idx) => {
    const hasAbs = typeof pane.x === 'number'
    const hasPct = typeof pane.xPct === 'number'

    // Inject absolute geometry if missing
    const base = hasAbs ? pane : (() => {
      const { w, h } = DEFAULT_PANE_SIZES[pane.type]
      const stagger = idx * 30
      return { ...pane, x: 40 + stagger, y: 40 + stagger, width: w, height: h }
    })()

    // Inject fractions if missing (best-effort using fallback viewport)
    if (hasPct) return base
    return {
      ...base,
      xPct: base.x / FALLBACK_VP_W,
      yPct: base.y / FALLBACK_VP_H,
      wPct: base.width  / FALLBACK_VP_W,
      hPct: base.height / FALLBACK_VP_H
    }
  })
}

function migrateWorkspaces(workspaces: WorkspaceState[]): WorkspaceState[] {
  return workspaces.map((ws) => ({
    ...ws,
    canvasOffset: ws.canvasOffset ?? { x: 0, y: 0 },
    panes: injectPaneGeometry(ws.panes)
  }))
}

function isValidDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

function sanitizePaths(workspaces: WorkspaceState[]): WorkspaceState[] {
  const home = homedir()
  return workspaces.map((ws) => ({
    ...ws,
    panes: ws.panes.map((pane) => {
      if (pane.type !== 'file-browser') return pane
      return {
        ...pane,
        leftPath: isValidDir(pane.leftPath) ? pane.leftPath : home,
        rightPath: isValidDir(pane.rightPath) ? pane.rightPath : home
      }
    })
  }))
}

function createDefaultWorkspace(): WorkspaceState {
  const paneId = randomUUID()
  const home = homedir()
  // Default pane: 1/4 screen (half viewport in each dimension), top-left of screen 0
  const wPct = 0.5
  const hPct = 0.5
  return {
    id: randomUUID(),
    name: 'Workspace 1',
    activePaneId: paneId,
    canvasOffset: { x: 0, y: 0 },
    panes: [
      {
        id: paneId,
        type: 'file-browser',
        title: 'Files',
        x: 40,
        y: 40,
        width:  Math.round(wPct * FALLBACK_VP_W),
        height: Math.round(hPct * FALLBACK_VP_H),
        xPct: 40 / FALLBACK_VP_W,
        yPct: 40 / FALLBACK_VP_H,
        wPct,
        hPct,
        leftPath: home,
        rightPath: home,
        focusedSide: 'left',
        leftSelection: [],
        rightSelection: []
      }
    ]
  }
}

const defaultSnapshot: AppStateSnapshot = {
  workspaces: [createDefaultWorkspace()],
  activeWorkspaceId: '',
  settings: DEFAULT_SETTINGS,
  recentlyClosed: []
}
defaultSnapshot.activeWorkspaceId = defaultSnapshot.workspaces[0].id

type StoreSchema = AppStateSnapshot

const STORE_NAME = 'ananke-commander-state'
const LEGACY_STORE_NAME = 'totalcmd-state'

function migrateLegacyStateIfNeeded(): void {
  try {
    const dir = app.getPath('userData')
    const nextPath = join(dir, `${STORE_NAME}.json`)
    const prevPath = join(dir, `${LEGACY_STORE_NAME}.json`)
    if (!existsSync(nextPath) && existsSync(prevPath)) {
      copyFileSync(prevPath, nextPath)
    }
  } catch {
    /* ignore migration failures */
  }
}

export class StateStore {
  private store: Store<StoreSchema>
  private pendingPatch: Partial<AppStateSnapshot> = {}
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    migrateLegacyStateIfNeeded()
    this.store = new Store<StoreSchema>({
      name: STORE_NAME,
      defaults: structuredClone(defaultSnapshot)
    })
    if (!this.store.get('activeWorkspaceId')) {
      const ws = createDefaultWorkspace()
      this.store.set('workspaces', [ws])
      this.store.set('activeWorkspaceId', ws.id)
    }
  }

  getSnapshot(): AppStateSnapshot {
    const disk: AppStateSnapshot = {
      workspaces: migrateWorkspaces(sanitizePaths(this.store.get('workspaces'))),
      activeWorkspaceId: this.store.get('activeWorkspaceId'),
      settings: this.store.get('settings'),
      recentlyClosed: this.store.get('recentlyClosed')
    }
    return { ...disk, ...this.pendingPatch }
  }

  setSnapshot(patch: Partial<AppStateSnapshot>): void {
    Object.assign(this.pendingPatch, patch)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.flushSnapshot()
    }, 300)
  }

  flushSnapshot(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    const patch = this.pendingPatch
    this.pendingPatch = {}
    if (patch.workspaces !== undefined) this.store.set('workspaces', patch.workspaces)
    if (patch.activeWorkspaceId !== undefined) this.store.set('activeWorkspaceId', patch.activeWorkspaceId)
    if (patch.settings !== undefined) this.store.set('settings', patch.settings)
    if (patch.recentlyClosed !== undefined) this.store.set('recentlyClosed', patch.recentlyClosed)
  }

  getSettings(): AppSettings {
    return this.store.get('settings')
  }

  updateSettings(settings: AppSettings): void {
    this.store.set('settings', settings)
  }

  trimRecentlyClosed(max: number): void {
    const list = this.store.get('recentlyClosed')
    if (list.length > max) {
      this.store.set('recentlyClosed', list.slice(-max))
    }
  }

  pushRecentlyClosed(entry: RecentlyClosedEntry, max: number): void {
    const list = [...this.store.get('recentlyClosed'), entry]
    this.store.set('recentlyClosed', list.slice(-max))
  }

  removeRecentlyClosed(id: string): void {
    this.store.set(
      'recentlyClosed',
      this.store.get('recentlyClosed').filter((e) => e.id !== id)
    )
  }

  purgeRecentlyClosed(): void {
    this.store.set('recentlyClosed', [])
  }

  applyRecentlyClosedRetention(): void {
    const max = this.store.get('settings').privacy.recentlyClosedMax
    this.trimRecentlyClosed(max)
  }

  updatePane(workspaceId: string, paneId: string, updater: (p: PaneState) => PaneState): void {
    const workspaces = this.store.get('workspaces').map((ws) => {
      if (ws.id !== workspaceId) return ws
      return {
        ...ws,
        panes: ws.panes.map((p) => (p.id === paneId ? updater(p) : p))
      }
    })
    this.store.set('workspaces', workspaces)
  }

  replaceWorkspacePanes(workspaceId: string, panes: PaneState[], activePaneId: string | null): void {
    const workspaces = this.store.get('workspaces').map((ws) =>
      ws.id === workspaceId ? { ...ws, panes, activePaneId } : ws
    )
    this.store.set('workspaces', workspaces)
  }

  setActiveWorkspacePane(workspaceId: string, activePaneId: string | null): void {
    const workspaces = this.store.get('workspaces').map((ws) =>
      ws.id === workspaceId ? { ...ws, activePaneId } : ws
    )
    this.store.set('workspaces', workspaces)
  }

  addWorkspace(name: string): WorkspaceState {
    const ws = createDefaultWorkspace()
    ws.name = name
    const all = [...this.store.get('workspaces'), ws]
    this.store.set('workspaces', all)
    return ws
  }

  setActiveWorkspace(id: string): void {
    this.store.set('activeWorkspaceId', id)
  }

  getWorkspace(id: string): WorkspaceState | undefined {
    return this.store.get('workspaces').find((w) => w.id === id)
  }

  updatePaneGeometry(workspaceId: string, paneId: string, x: number, y: number, w: number, h: number): void {
    const workspaces = this.store.get('workspaces').map((ws) => {
      if (ws.id !== workspaceId) return ws
      return {
        ...ws,
        panes: ws.panes.map((p) =>
          p.id === paneId ? { ...p, x, y, width: w, height: h } : p
        )
      }
    })
    this.store.set('workspaces', workspaces)
  }

  setCanvasOffset(workspaceId: string, x: number, y: number): void {
    const workspaces = this.store.get('workspaces').map((ws) =>
      ws.id === workspaceId ? { ...ws, canvasOffset: { x, y } } : ws
    )
    this.store.set('workspaces', workspaces)
  }

  renameWorkspace(workspaceId: string, name: string): void {
    const workspaces = this.store.get('workspaces').map((ws) =>
      ws.id === workspaceId ? { ...ws, name } : ws
    )
    this.store.set('workspaces', workspaces)
  }

  deleteWorkspace(workspaceId: string): void {
    const all = this.store.get('workspaces').filter((w) => w.id !== workspaceId)
    if (all.length === 0) return
    this.store.set('workspaces', all)
    if (this.store.get('activeWorkspaceId') === workspaceId) {
      this.store.set('activeWorkspaceId', all[0].id)
    }
  }

  cloneWorkspace(workspaceId: string): WorkspaceState | undefined {
    const src = this.store.get('workspaces').find((w) => w.id === workspaceId)
    if (!src) return undefined
    const cloned: WorkspaceState = {
      ...structuredClone(src),
      id: randomUUID(),
      name: `${src.name} copy`,
      canvasOffset: { x: 0, y: 0 },
      panes: src.panes.map((p) => ({ ...structuredClone(p), id: randomUUID() })),
      activePaneId: null
    }
    if (cloned.panes.length > 0) cloned.activePaneId = cloned.panes[0].id
    const all = [...this.store.get('workspaces'), cloned]
    this.store.set('workspaces', all)
    return cloned
  }
}
