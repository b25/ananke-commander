import { app } from 'electron'
import Store from 'electron-store'
import { copyFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AppSettings, AppStateSnapshot, PaneState, RecentlyClosedEntry, WorkspaceState } from '../../shared/contracts.js'
import { DEFAULT_SETTINGS } from '../../shared/contracts.js'
import { TomlConfigService, tomlToSnapshot } from '../tomlConfig.js'
import { normalizeWorkspaces } from './workspaceMigration.js'
import { activePaneUnchanged, toLeanSnapshot } from './stateStoreUtils.js'

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

    // Normalize stored workspaces ONCE at startup. Doing it here (at the write boundary)
    // lets getSnapshot() be a cheap read instead of re-running statSync on every
    // file-browser path on every state IPC call.
    this.store.set('workspaces', normalizeWorkspaces(this.store.get('workspaces')))

    this.tomlService = new TomlConfigService(this.handleExternalTomlChange.bind(this))

    // On first launch (no TOML yet), write current state; otherwise merge from TOML
    const existing = this.tomlService.readRaw()
    if (existing === null) {
      this.tomlService.write(this.getSnapshot())
    } else {
      try {
        const parsed = tomlToSnapshot(existing)
        this.store.set('workspaces', normalizeWorkspaces(parsed.workspaces))
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
    this.store.set('workspaces', normalizeWorkspaces(parsed.workspaces))
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

  private _buildSnapshot(): AppStateSnapshot {
    const stored = this.store.get('settings')
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      privacy: { ...DEFAULT_SETTINGS.privacy, ...stored?.privacy },
      terminal: { ...DEFAULT_SETTINGS.terminal, ...stored?.terminal },
      obsidian: { ...DEFAULT_SETTINGS.obsidian, ...stored?.obsidian }
    }
    // Workspaces are normalized when they enter the store (startup / TOML import), so this is
    // a cheap read — no per-call statSync on file-browser paths.
    const disk: AppStateSnapshot = {
      workspaces: this.store.get('workspaces'),
      activeWorkspaceId: this.store.get('activeWorkspaceId'),
      settings,
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

  /** Full snapshot for initial hydration and RC-mutating handlers (closePane, restoreClosed, etc.). */
  getSnapshot(): AppStateSnapshot { return this._buildSnapshot() }

  /**
   * Lean snapshot for high-frequency mutation handlers (setActivePane, updatePane, setCanvasOffset,
   * layout changes). Omits recentlyClosed to avoid cloning up-to-50 full pane entries over IPC.
   */
  getLeanSnapshot(): AppStateSnapshot { return toLeanSnapshot(this._buildSnapshot()) }

  /** Returns only the recentlyClosed list — used by the dedicated state:getRecentlyClosed handler. */
  getRecentlyClosed(): RecentlyClosedEntry[] { return this.store.get('recentlyClosed') }

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
    this.scheduleTomlFlush()
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
    // PERF-1: skip the synchronous store write + TOML rewrite when the pane is already active
    if (activePaneUnchanged(this.store.get('workspaces'), workspaceId, activePaneId)) return
    this.store.set('workspaces', this.store.get('workspaces').map((ws) => ws.id === workspaceId ? { ...ws, activePaneId } : ws))
    this.scheduleTomlFlush()
  }

  pauseWatch(): void { this.tomlService.pause() }
  resumeWatch(): void { this.tomlService.resume() }
  getTomlRaw(): string | null { return this.tomlService.readRaw() }

  validateAndApplyToml(raw: string): string | null {
    try {
      const parsed = tomlToSnapshot(raw)
      this.store.set('workspaces', normalizeWorkspaces(parsed.workspaces))
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

  setActiveWorkspace(id: string): void { this.store.set('activeWorkspaceId', id); this.scheduleTomlFlush() }
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
