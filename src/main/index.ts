import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, rm, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  registerPrivilegedAppScheme,
  registerAppProtocolHandler,
  appEntryUrl
} from './protocol/registerAppProtocol.js'
import { StateStore } from './store/stateStore.js'
import { FileJobManager } from './jobs/fileJobManager.js'
import { FolderSizeManager } from './jobs/folderSizeManager.js'
import { TerminalManager } from './pty/terminalManager.js'
import { BrowserPaneManager } from './browser/browserPaneManager.js'
import { TerminalSessionStore } from './pty/terminalSessionStore.js'
import { isExternalUrlAllowed } from './security/browserSecurity.js'
import { syncBrowserGuestHostsFromSettings } from './security/syncGuestHosts.js'
import { assertMaxBytes, IPC_LIMITS } from './ipc/ipcLimits.js'
import * as archive from './archive/archiveService.js'
import { saveMarkdownToVault, listVaultNotes, readVaultNote, deleteVaultNote } from './notes/notesService.js'
import type { AppStateSnapshot, PaneState, TerminalSessionMeta } from '../shared/contracts.js'
import { randomUUID } from 'node:crypto'
import { installAppMenu } from './menu.js'
import { registerApiToolkitHandlers } from './api-toolkit/ipcHandlers.js'
import { registerBrowserIpcHandlers } from './ipc/registerBrowserIpc.js'
import { registerFsIpcHandlers } from './ipc/registerFsIpc.js'

registerPrivilegedAppScheme()

let mainWindow: BrowserWindow | null = null
let stateStore: StateStore | null = null
let fileJobs: FileJobManager | null = null
let folderSizeMgr: FolderSizeManager | null = null
let terminals: TerminalManager | null = null
let browserPanes: BrowserPaneManager | null = null
let termHistory: TerminalSessionStore | null = null

function getTerminals(): TerminalManager {
  if (!terminals) terminals = new TerminalManager(mainWindow!)
  return terminals
}

function getFileJobs(): FileJobManager {
  if (!fileJobs) fileJobs = new FileJobManager(mainWindow!)
  return fileJobs
}

function getFolderSizeMgr(): FolderSizeManager {
  if (!folderSizeMgr) folderSizeMgr = new FolderSizeManager(mainWindow!)
  return folderSizeMgr
}

function getTermHistory(): TerminalSessionStore {
  if (!termHistory) termHistory = new TerminalSessionStore()
  return termHistory
}

function getBrowserPanes(): BrowserPaneManager {
  if (!browserPanes) {
    browserPanes = new BrowserPaneManager(mainWindow!, {
      maxEntries: () => stateStore!.getSettings().privacy.browserHistoryMax,
      shouldRecord: () => !stateStore!.getSettings().privacy.privateMode,
      onHistory: (paneId, entries) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('browser:history', { paneId, entries })
        }
      }
    })
  }
  return browserPanes
}

let protocolRegistered = false
let ipcRegistered = false

function rendererDist(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../renderer')
}

function preloadScriptPath(): string {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../preload')
  const mjs = join(dir, 'index.mjs')
  if (existsSync(mjs)) return mjs
  const cjs = join(dir, 'index.cjs')
  if (existsSync(cjs)) return cjs
  return join(dir, 'index.js')
}

function focusedOrMain(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? mainWindow
}

function registerIpcHandlers(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('app:getPath', (_e, name: 'home' | 'documents' | 'downloads' | 'userData') =>
    app.getPath(name)
  )

  ipcMain.handle('clipboard:writeText', (_e, text: string) => {
    assertMaxBytes('clipboard:writeText', text, IPC_LIMITS.clipboardText)
    clipboard.writeText(text)
  })

  ipcMain.handle('state:get', (): AppStateSnapshot => stateStore!.getSnapshot())

  ipcMain.handle('state:set', (_e, patch: Partial<AppStateSnapshot>) => {
    const estimate = JSON.stringify(patch).length
    if (estimate > IPC_LIMITS.stateSetJsonEstimate) {
      throw new Error(`state:set patch too large (${estimate} bytes)`)
    }
    stateStore!.setSnapshot(patch)
    stateStore!.applyRecentlyClosedRetention()
    if (patch.settings !== undefined) {
      syncBrowserGuestHostsFromSettings(stateStore!.getSnapshot().settings)
    }
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:replacePanes', (_e, wsId: string, panes: PaneState[], activeId: string | null) => {
    stateStore!.replaceWorkspacePanes(wsId, panes, activeId)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:addWorkspace', (_e, name: string) => {
    const ws = stateStore!.addWorkspace(name)
    stateStore!.setActiveWorkspace(ws.id)
    stateStore!.flushToml()
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:setActiveWorkspace', (_e, id: string) => {
    stateStore!.setActiveWorkspace(id)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:setActivePane', (_e, workspaceId: string, paneId: string) => {
    stateStore!.setActiveWorkspacePane(workspaceId, paneId)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:updatePane', (_e, workspaceId: string, paneId: string, next: PaneState) => {
    stateStore!.updatePane(workspaceId, paneId, () => next)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:closePane', (_e, workspaceId: string, paneId: string) => {
    const ws = stateStore!.getWorkspace(workspaceId)
    if (!ws) return stateStore!.getSnapshot()
    const pane = ws.panes.find((p) => p.id === paneId)
    const panes = ws.panes.filter((p) => p.id !== paneId)
    const active = ws.activePaneId === paneId ? (panes[0]?.id ?? null) : ws.activePaneId
    if (pane && !stateStore!.getSettings().privacy.privateMode) {
      const max = stateStore!.getSettings().privacy.recentlyClosedMax
      stateStore!.pushRecentlyClosed(
        { id: randomUUID(), closedAt: Date.now(), snapshot: structuredClone(pane) },
        max
      )
    }
    if (pane?.type === 'terminal' || pane?.type === 'gitui') getTerminals().dispose(paneId)
    if (pane?.type === 'browser') getBrowserPanes().destroy(paneId)
    stateStore!.replaceWorkspacePanes(workspaceId, panes, active)
    stateStore!.flushToml()
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:removeRecentlyClosed', (_e, entryId: string) => {
    stateStore!.removeRecentlyClosed(entryId)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:purgeRecentlyClosed', () => {
    stateStore!.purgeRecentlyClosed()
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:restoreClosed', (_e, workspaceId: string, entryId: string) => {
    const snap = stateStore!.getSnapshot()
    const entry = snap.recentlyClosed.find((e) => e.id === entryId)
    if (!entry) return snap
    const ws = stateStore!.getWorkspace(workspaceId)
    if (!ws) return snap
    const panes = [...ws.panes, structuredClone(entry.snapshot)]
    stateStore!.removeRecentlyClosed(entryId)
    stateStore!.replaceWorkspacePanes(workspaceId, panes, entry.snapshot.id)
    return stateStore!.getSnapshot()
  })

  registerFsIpcHandlers({
    getFileJobs,
    getFolderSizeMgr,
    getTerminals
  })

  registerBrowserIpcHandlers({
    getBrowserPanes,
    isPackaged: app.isPackaged
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (isExternalUrlAllowed(url)) await shell.openExternal(url)
  })

  ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
    if (!filePath || filePath.includes('\0')) throw new Error('Invalid path')
    const abs = normalize(resolve(filePath))
    try {
      const st = await stat(abs)
      if (!st.isFile() && !st.isDirectory()) throw new Error('Not a file or directory')
    } catch (e) {
      if (e instanceof Error && e.message === 'Not a file or directory') throw e
      throw new Error('Path does not exist')
    }
    return shell.openPath(abs)
  })

  ipcMain.handle('dialog:pickDirectory', async () => {
    const win = focusedOrMain()
    if (!win) return null
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (_e, defaultName: string) => {
    const win = focusedOrMain()
    if (!win) return null
    const r = await dialog.showSaveDialog(win, { defaultPath: defaultName })
    if (r.canceled || !r.filePath) return null
    return r.filePath
  })

  ipcMain.handle(
    'archive:pack',
    async (_e, format: 'zip' | 'tgz', sources: string[], outFile: string) => {
      if (format === 'zip') await archive.packZip(sources, outFile)
      else await archive.packTarGzip(sources, outFile)
    }
  )

  ipcMain.handle(
    'archive:unpack',
    async (_e, format: 'zip' | 'tgz', archivePath: string, outDir: string) => {
      if (format === 'zip') await archive.unpackZip(archivePath, outDir)
      else await archive.unpackTarGzip(archivePath, outDir)
    }
  )

  ipcMain.handle(
    'notes:saveVault',
    async (_e, vaultPath: string, subfolder: string, filename: string, body: string) => {
      assertMaxBytes('notes:saveVault', body, IPC_LIMITS.notesBody)
      return saveMarkdownToVault(vaultPath, subfolder, filename, body)
    }
  )

  ipcMain.handle('notes:listVault', async (_e, vaultPath: string, subfolder: string) => {
    return listVaultNotes(vaultPath, subfolder)
  })

  ipcMain.handle('notes:readVault', async (_e, vaultPath: string, subfolder: string, filename: string) => {
    return readVaultNote(vaultPath, subfolder, filename)
  })

  ipcMain.handle('notes:deleteVault', async (_e, vaultPath: string, subfolder: string, filename: string) => {
    return deleteVaultNote(vaultPath, subfolder, filename)
  })

  ipcMain.handle('state:setCanvasOffset', (_e, wsId: string, x: number, y: number) => {
    stateStore!.setCanvasOffset(wsId, x, y)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:setScreenLayout', (_e, wsId: string, screenIndex: number, layoutId: string) => {
    stateStore!.setScreenLayout(wsId, screenIndex, layoutId)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:setIntentLayout', (_e, wsId: string, screenIndex: number, layoutId: string) => {
    stateStore!.setIntentLayout(wsId, screenIndex, layoutId)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:setScreenCollapsed', (_e, wsId: string, screenIndex: number, ids: string[]) => {
    stateStore!.setScreenCollapsed(wsId, screenIndex, ids)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:cloneWorkspace', (_e, wsId: string) => {
    const ws = stateStore!.cloneWorkspace(wsId)
    if (ws) stateStore!.setActiveWorkspace(ws.id)
    stateStore!.flushToml()
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:renameWorkspace', (_e, wsId: string, name: string) => {
    stateStore!.renameWorkspace(wsId, name)
    stateStore!.flushToml()
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:deleteWorkspace', (_e, wsId: string) => {
    stateStore!.deleteWorkspace(wsId)
    stateStore!.flushToml()
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('config:getTomlPath', () => stateStore!.getTomlPath())

  ipcMain.handle('config:openToml', async () => {
    const p = stateStore!.getTomlPath()
    return shell.openPath(p)
  })

  ipcMain.handle('config:writeToml', () => {
    stateStore!.flushToml()
  })

  ipcMain.handle('config:pauseWatch', () => { stateStore!.pauseWatch() })
  ipcMain.handle('config:resumeWatch', () => { stateStore!.resumeWatch() })
  ipcMain.handle('config:readToml', () => stateStore!.getTomlRaw())
  ipcMain.handle('config:applyToml', (_e, raw: string): { error: string | null; snapshot: AppStateSnapshot | null } => {
    const error = stateStore!.validateAndApplyToml(raw)
    return { error, snapshot: error ? null : stateStore!.getSnapshot() }
  })

  ipcMain.handle('termHistory:save', async (_e, meta: TerminalSessionMeta, text: string) => {
    const max = stateStore!.getSettings().privacy.terminalHistoryMax
    await getTermHistory().save(meta, text, max)
  })

  ipcMain.handle('termHistory:list', () => getTermHistory().list())

  ipcMain.handle('termHistory:read', (_e, id: string) => getTermHistory().read(id))

  ipcMain.handle('termHistory:delete', (_e, id: string) => getTermHistory().delete(id))

  ipcMain.handle('termHistory:clear', () => getTermHistory().clear())

  // Register all API Toolkit HTTP/gRPC/storage IPC channels
  registerApiToolkitHandlers()
}

async function createWindow(): Promise<void> {
  if (!protocolRegistered) {
    await registerAppProtocolHandler(rendererDist())
    protocolRegistered = true
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: 'Ananke Commander',
    icon: join(app.getAppPath(), 'resources', 'icon.png'),
    webPreferences: {
      preload: preloadScriptPath(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  })
  mainWindow = win

  stateStore = new StateStore()
  stateStore.setMainWindow(win)
  syncBrowserGuestHostsFromSettings(stateStore.getSnapshot().settings)

  registerIpcHandlers()

  await win.loadURL(appEntryUrl())

  if (!app.isPackaged) {
    win.webContents.openDevTools()
  }

  win.on('closed', () => {
    // Auto-save open terminal sessions before shutdown
    if (terminals && stateStore && !stateStore.getSettings().privacy.privateMode) {
      const sessions = terminals.drainAllSessions()
      const max = stateStore.getSettings().privacy.terminalHistoryMax
      for (const s of sessions) {
        void getTermHistory().save({
          id: randomUUID(),
          paneId: s.paneId,
          title: s.cwd.split('/').pop() || 'terminal',
          cwd: s.cwd,
          startedAt: s.startedAt,
          endedAt: Date.now(),
          lineCount: s.text.split('\n').length
        }, s.text, max)
      }
    }
    stateStore?.flushSnapshot()
    stateStore?.flushToml()
    stateStore?.dispose()
    fileJobs?.dispose()
    fileJobs = null
    folderSizeMgr?.dispose()
    folderSizeMgr = null
    terminals?.disposeAll()
    terminals = null
    browserPanes?.destroyAll()
    browserPanes = null
    termHistory = null
    stateStore = null
    mainWindow = null
  })
}

app.whenReady().then(() => {
  installAppMenu()
  void createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
