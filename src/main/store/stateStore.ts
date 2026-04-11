import { app } from 'electron'
import Store from 'electron-store'
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AppSettings, AppStateSnapshot, PaneState, PaneType, RecentlyClosedEntry, WorkspaceState } from '../../shared/contracts.js'
import { DEFAULT_SETTINGS } from '../../shared/contracts.js'
import { TomlConfigService, tomlToSnapshot } from '../tomlConfig.js'

const FALLBACK_VP_W = 1440
const FALLBACK_VP_H = 900

const DEFAULT_PANE_SIZES: Record<PaneType, { w: number; h: number }> = {
  'file-browser': { w: 720, h: 450 },
  'terminal':     { w: 720, h: 450 },
  'browser':      { w: 720, h: 450 },
  'notes':        { w: 720, h: 450 },
  'radar':        { w: 720, h: 450 },
  'gitui':        { w: 720, h: 450 },
  'api-toolkit':  { w: 720, h: 450 }
}

function injectPaneGeometry(panes: PaneState[]): PaneState[] {
  return panes.map((pane, idx) => {
    const base = typeof pane.x === 'number' ? pane : (() => {
      const { w, h } = DEFAULT_PANE_SIZES[pane.type]
      const s = idx * 30
      return { ...pane, x: 40 + s, y: 40 + s, width: w, height: h }
    })()
    if (typeof base.xPct === 'number') return base
    return { ...base, xPct: base.x / FALLBACK_VP_W, yPct: base.y / FALLBACK_VP_H, wPct: base.width / FALLBACK_VP_W, hPct: base.height / FALLBACK_VP_H }
  })
}

function migrateWorkspaces(workspaces: WorkspaceState[]): WorkspaceState[] {
  return workspaces.map((ws) => ({
    ...ws,
    canvasOffset: ws.canvasOffset ?? { x: 0, y: 0 },
    screenLayouts: ws.screenLayouts ?? {},
    intentLayouts: ws.intentLayouts ?? {},
    screenCollapsed: ws.screenCollapsed ?? {},
    panes: injectPaneGeometry(ws.panes)
  }))
}

function isValidDir(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}

function sanitizePaths(workspaces: WorkspaceState[]): WorkspaceState[] {
  const home = homedir()
  return workspaces.map((ws) => ({
    ...ws,
    panes: ws.panes.map((pane) => {
      if (pane.type !== 'file-browser') return pane
      return { ...pane, leftPath: isValidDir(pane.leftPath) ? pane.leftPath : home, rightPath: isValidDir(pane.rightPath) ? pane.rightPath : home }
    })
  }))
}

function createDefaultWorkspace(): WorkspaceState {
  const paneId = randomUUID()
  const home = homedir()
  return {
    id: randomUUID(), name: 'Workspace 1', activePaneId: paneId,
    canvasOffset: { x: 0, y: 0 }, screenLayouts: {}, intentLayouts: {}, screenCollapsed: {},
    panes: [{
      id: paneId, type: 'file-browser', title: 'Files',
      x: 0, y: 0, width: 720, height: 450,
      xPct: 0, yPct: 0, wPct: 0.5, hPct: 0.5,
      leftPath: home, rightPath: home, focusedSide: 'left', leftSelection: [], rightSelection: []
    }]
  }
}

const defaultSnapshot: AppStateSnapshot = { workspaces: [createDefaultWorkspace()], activeWorkspaceId: '', settings: DEFAULT_SETTINGS, recentlyClosed: [] }
defaultSnapshot.activeWorkspaceId = defaultSnapshot.workspaces[0].id

type StoreSchema = AppStateSnapshot
const STORE_NAME = 'ananke-commander-state'
const LEGACY_STORE_NAME = 'totalcmd-state'

function migrateLegacyStateIfNeeded(): void {
  try {
    const dir = app.getPath('userData')
    const nextPath = join(dir, `${STORE_NAME}.json`)
    const prevPath = join(dir, `${LEGACY_STORE_NAME}.json`)
    if (!existsSync(nextPath) && existsSync(prevPath)) copyFileSync(prevPath, nextPath)
  } catch { /* ignore */ }
}

export class StateStore {
  private store: Store<StoreSchema>
  private pendingPatch: Partial<AppStateSnapshot> = {}
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private tomlService: TomlConfigService
  private mainWindow: import('electron').BrowserWindow | null = null

  constructor() {
    migrateLegacyStateIfNeeded()
    this.store = new Store<StoreSchema>({ name: STORE_NAME, defaults: structuredClone(defaultSnapshot) })
    if (!this.store.get('activeWorkspaceId')) {
      const ws = createDefaultWorkspace()
      this.store.set('workspaces', [ws])
      this.store.set('activeWorkspaceId', ws.id)
    }

    this.tomlService = new TomlConfigService(this.handleExternalTomlChange.bind(this))

    // On first launch (no TOML yet), write current state; otherwise merge from TOML
    const existing = this.tomlService.readRaw()
    if (existing === null) {
      this.tomlService.write(this.getSnapshot())
    } else {
      try {
        const parsed = tomlToSnapshot(existing)
        this.store.set('workspaces', migrateWorkspaces(sanitizePaths(parsed.workspaces)))
        this.store.set('activeWorkspaceId', parsed.activeWorkspaceId)
      } catch { /* malformed TOML on startup — keep electron-store state */ }
    }
    this.tomlService.startWatching()
  }

  setMainWindow(win: import('electron').BrowserWindow | null): void {
    this.mainWindow = win
  }

  private handleExternalTomlChange(raw: string): void {
    let parsed: ReturnType<typeof tomlToSnapshot>
    try {
      parsed = tomlToSnapshot(raw)
    } catch (e) {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('config:toml-error', String(e))
      }
      return
    }
    this.store.set('workspaces', migrateWorkspaces(sanitizePaths(parsed.workspaces)))
    this.store.set('activeWorkspaceId', parsed.activeWorkspaceId)
    this.pendingPatch = {}
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('config:state-changed', this.getSnapshot())
    }
  }

  flushToml(): void {
    this.tomlService.write(this.getSnapshot())
  }

  getTomlPath(): string { return this.tomlService.getPath() }

  dispose(): void { this.tomlService.stopWatching() }

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
    this.debounceTimer = setTimeout(() => this.flushSnapshot(), 300)
  }

  flushSnapshot(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
    const patch = this.pendingPatch; this.pendingPatch = {}
    if (patch.workspaces !== undefined) this.store.set('workspaces', patch.workspaces)
    if (patch.activeWorkspaceId !== undefined) this.store.set('activeWorkspaceId', patch.activeWorkspaceId)
    if (patch.settings !== undefined) this.store.set('settings', patch.settings)
    if (patch.recentlyClosed !== undefined) this.store.set('recentlyClosed', patch.recentlyClosed)
  }

  getSettings(): AppSettings { return this.store.get('settings') }
  updateSettings(settings: AppSettings): void { this.store.set('settings', settings) }
  trimRecentlyClosed(max: number): void { const l = this.store.get('recentlyClosed'); if (l.length > max) this.store.set('recentlyClosed', l.slice(-max)) }
  pushRecentlyClosed(entry: RecentlyClosedEntry, max: number): void { this.store.set('recentlyClosed', [...this.store.get('recentlyClosed'), entry].slice(-max)) }
  removeRecentlyClosed(id: string): void { this.store.set('recentlyClosed', this.store.get('recentlyClosed').filter((e) => e.id !== id)) }
  purgeRecentlyClosed(): void { this.store.set('recentlyClosed', []) }
  applyRecentlyClosedRetention(): void { this.trimRecentlyClosed(this.store.get('settings').privacy.recentlyClosedMax) }

  updatePane(workspaceId: string, paneId: string, updater: (p: PaneState) => PaneState): void {
    this.store.set('workspaces', this.store.get('workspaces').map((ws) =>
      ws.id !== workspaceId ? ws : { ...ws, panes: ws.panes.map((p) => p.id === paneId ? updater(p) : p) }
    ))
  }

  private tomlDebounceTimer: ReturnType<typeof setTimeout> | null = null

  private scheduleTomlFlush(): void {
    if (this.tomlDebounceTimer) clearTimeout(this.tomlDebounceTimer)
    this.tomlDebounceTimer = setTimeout(() => {
      this.tomlDebounceTimer = null
      this.flushToml()
    }, 500)
  }

  replaceWorkspacePanes(workspaceId: string, panes: PaneState[], activePaneId: string | null): void {
    this.store.set('workspaces', this.store.get('workspaces').map((ws) => ws.id === workspaceId ? { ...ws, panes, activePaneId } : ws))
    this.scheduleTomlFlush()
  }

  setActiveWorkspacePane(workspaceId: string, activePaneId: string | null): void {
    this.store.set('workspaces', this.store.get('workspaces').map((ws) => ws.id === workspaceId ? { ...ws, activePaneId } : ws))
  }

  pauseWatch(): void { this.tomlService.pause() }
  resumeWatch(): void { this.tomlService.resume() }
  getTomlRaw(): string | null { return this.tomlService.readRaw() }

  validateAndApplyToml(raw: string): string | null {
    try {
      const parsed = tomlToSnapshot(raw)
      this.store.set('workspaces', migrateWorkspaces(sanitizePaths(parsed.workspaces)))
      this.store.set('activeWorkspaceId', parsed.activeWorkspaceId)
      this.pendingPatch = {}
      this.flushToml()
      return null
    } catch (e) {
      return String(e)
    }
  }

  setScreenLayout(workspaceId: string, screenIndex: number, layoutId: string): void {
    this.store.set('workspaces', this.store.get('workspaces').map((ws) =>
      ws.id !== workspaceId ? ws : { ...ws, screenLayouts: { ...ws.screenLayouts, [screenIndex]: layoutId } }
    ))
    this.scheduleTomlFlush()
  }

  addWorkspace(name: string): WorkspaceState {
    const ws = createDefaultWorkspace(); ws.name = name
    this.store.set('workspaces', [...this.store.get('workspaces'), ws])
    this.scheduleTomlFlush()
    return ws
  }

  setActiveWorkspace(id: string): void { this.store.set('activeWorkspaceId', id) }
  getWorkspace(id: string): WorkspaceState | undefined { return this.store.get('workspaces').find((w) => w.id === id) }

  setCanvasOffset(workspaceId: string, x: number, y: number): void {
    this.store.set('workspaces', this.store.get('workspaces').map((ws) => ws.id === workspaceId ? { ...ws, canvasOffset: { x, y } } : ws))
    this.scheduleTomlFlush()
  }

  renameWorkspace(workspaceId: string, name: string): void {
    this.store.set('workspaces', this.store.get('workspaces').map((ws) => ws.id === workspaceId ? { ...ws, name } : ws))
    this.scheduleTomlFlush()
  }

  deleteWorkspace(workspaceId: string): void {
    const all = this.store.get('workspaces').filter((w) => w.id !== workspaceId)
    if (all.length === 0) return
    this.store.set('workspaces', all)
    if (this.store.get('activeWorkspaceId') === workspaceId) this.store.set('activeWorkspaceId', all[0].id)
    this.scheduleTomlFlush()
  }

  setIntentLayout(workspaceId: string, screenIndex: number, layoutId: string): void {
    this.store.set('workspaces', this.store.get('workspaces').map((ws) =>
      ws.id !== workspaceId ? ws : { ...ws, intentLayouts: { ...ws.intentLayouts, [screenIndex]: layoutId } }
    ))
    this.scheduleTomlFlush()
  }

  setScreenCollapsed(workspaceId: string, screenIndex: number, ids: string[]): void {
    this.store.set('workspaces', this.store.get('workspaces').map((ws) =>
      ws.id !== workspaceId ? ws : { ...ws, screenCollapsed: { ...ws.screenCollapsed, [screenIndex]: ids } }
    ))
    this.scheduleTomlFlush()
  }

  cloneWorkspace(workspaceId: string): WorkspaceState | undefined {
    const src = this.store.get('workspaces').find((w) => w.id === workspaceId)
    if (!src) return undefined
    const cloned: WorkspaceState = { ...structuredClone(src), id: randomUUID(), name: `${src.name} copy`, canvasOffset: { x: 0, y: 0 }, screenLayouts: {}, intentLayouts: {}, screenCollapsed: {}, panes: src.panes.map((p) => ({ ...structuredClone(p), id: randomUUID() })), activePaneId: null }
    if (cloned.panes.length > 0) cloned.activePaneId = cloned.panes[0].id
    this.store.set('workspaces', [...this.store.get('workspaces'), cloned])
    this.scheduleTomlFlush()
    return cloned
  }
}
