import { app } from 'electron'
import Store from 'electron-store'
import { copyFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  AppSettings,
  AppStateSnapshot,
  PaneState,
  RecentlyClosedEntry,
  WorkspaceState
} from '../../shared/contracts.js'
import { DEFAULT_SETTINGS } from '../../shared/contracts.js'

function createDefaultWorkspace(): WorkspaceState {
  const paneId = randomUUID()
  const home = homedir()
  return {
    id: randomUUID(),
    name: 'Workspace 1',
    activePaneId: paneId,
    panes: [
      {
        id: paneId,
        type: 'file-browser',
        title: 'Files',
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

/** If legacy totalcmd state exists in the same userData dir, copy it once before opening the new store. */
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
    return {
      workspaces: this.store.get('workspaces'),
      activeWorkspaceId: this.store.get('activeWorkspaceId'),
      settings: this.store.get('settings'),
      recentlyClosed: this.store.get('recentlyClosed')
    }
  }

  setSnapshot(patch: Partial<AppStateSnapshot>): void {
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

  /** Trim list to current settings.privacy.recentlyClosedMax */
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
}
