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
import { isMainWindowNavigationAllowed } from './security/mainWindowNavigation.js'
import { assertMaxBytes, IPC_LIMITS } from './ipc/ipcLimits.js'
import * as archive from './archive/archiveService.js'
import { saveMarkdownToVault, listVaultNotes, readVaultNote, deleteVaultNote } from './notes/notesService.js'
import type { AppStateSnapshot, TerminalSessionMeta } from '../shared/contracts.js'
import { randomUUID } from 'node:crypto'
import { installAppMenu } from './menu.js'
import { registerApiToolkitHandlers } from './api-toolkit/ipcHandlers.js'
import { registerBrowserIpcHandlers } from './ipc/registerBrowserIpc.js'
import { registerFsIpcHandlers } from './ipc/registerFsIpc.js'
import { registerStateIpcHandlers } from './ipc/registerStateIpc.js'
import {
  attachMainWindowStatePersistence,
  getMainWindowCreateOptions,
  restoreMainWindowDevTools
} from './window/windowState.js'

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

  registerStateIpcHandlers({
    getStateStore: () => stateStore!,
    getBrowserPanes,
    getBrowserPanesIfActive: () => browserPanes,
    getTerminals
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
    ...getMainWindowCreateOptions(),
    minWidth: 640,
    minHeight: 480,
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
  const allowDevTools = !app.isPackaged

  // SEC-1: Lock down main-window navigation. The main window's webContents
  // carry the privileged preload (fs, pty, shell). Block any top-frame
  // navigation to origins other than app:// (or the vite dev server in dev).
  win.webContents.on('will-navigate', (event, url) => {
    if (!isMainWindowNavigationAllowed(url, !app.isPackaged)) {
      event.preventDefault()
    }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  attachMainWindowStatePersistence(win, allowDevTools)
  mainWindow = win

  stateStore = new StateStore()
  stateStore.setMainWindow(win)

  registerIpcHandlers()

  await win.loadURL(appEntryUrl())

  restoreMainWindowDevTools(win, allowDevTools)

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
