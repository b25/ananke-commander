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
import { isNavigationAllowed } from './security/browserSecurity.js'
import * as archive from './archive/archiveService.js'
import { saveMarkdownToVault, listVaultNotes, readVaultNote, deleteVaultNote } from './notes/notesService.js'
import type { AppStateSnapshot, PaneState, TerminalSessionMeta } from '../shared/contracts.js'
import { randomUUID } from 'node:crypto'
import { installAppMenu } from './menu.js'

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
    clipboard.writeText(text)
  })

  ipcMain.handle('state:get', (): AppStateSnapshot => stateStore!.getSnapshot())

  ipcMain.handle('state:set', (_e, patch: Partial<AppStateSnapshot>) => {
    stateStore!.setSnapshot(patch)
    stateStore!.applyRecentlyClosedRetention()
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:replacePanes', (_e, wsId: string, panes: PaneState[], activeId: string | null) => {
    stateStore!.replaceWorkspacePanes(wsId, panes, activeId)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:addWorkspace', (_e, name: string) => {
    const ws = stateStore!.addWorkspace(name)
    stateStore!.setActiveWorkspace(ws.id)
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

  ipcMain.handle('fs:readUtf8', async (_e, filePath: string) => {
    const abs = resolve(filePath)
    return readFile(abs, 'utf8')
  })

  ipcMain.handle('fs:writeUtf8', async (_e, filePath: string, text: string) => {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, text, 'utf8')
  })

  ipcMain.handle('fs:listDir', async (_e, dirPath: string) => {
    const abs = resolve(dirPath)
    const entries = await readdir(abs, { withFileTypes: true })
    const results = await Promise.allSettled(
      entries.map(async (e) => {
        const p = join(abs, e.name)
        const st = await stat(p)
        return {
          name: e.name,
          path: p,
          isDirectory: e.isDirectory(),
          size: st.size,
          mtimeMs: st.mtimeMs
        }
      })
    )
    const out = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    out.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return out
  })

  ipcMain.handle(
    'fs:quickOp',
    async (_e, op: 'mkdir' | 'delete', target: string, paths?: string[]) => {
      if (op === 'mkdir') {
        await mkdir(target, { recursive: true })
        return
      }
      if (paths?.length) {
        for (const p of paths) await rm(resolve(p), { recursive: true, force: true })
      }
    }
  )

  ipcMain.handle('fs:chmod', async (_e, filePath: string, mode: string) => {
    const { chmod } = await import('node:fs/promises')
    await chmod(resolve(filePath), parseInt(mode, 8))
  })

  ipcMain.handle('fs:createFile', async (_e, filePath: string) => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(resolve(filePath), '', { flag: 'wx' }) // wx = fail if exists
  })

  ipcMain.handle(
    'fileJob:start',
    (_e, kind: 'copy' | 'move' | 'delete', sources: string[], destDir?: string) => {
      if (kind === 'delete') {
        return getFileJobs().runJob('delete', sources.map((s) => resolve(s)))
      }
      if (!destDir) throw new Error('destDir required')
      return getFileJobs().runJob(kind, sources.map((s) => resolve(s)), resolve(destDir))
    }
  )

  ipcMain.handle('fileJob:cancel', () => {
    getFileJobs().cancel()
  })

  ipcMain.handle('fs:startFolderSize', (_e, dirPath: string) => {
    return getFolderSizeMgr().start(resolve(dirPath))
  })

  ipcMain.handle('fs:cancelFolderSize', (_e, requestId: string) => {
    getFolderSizeMgr().cancel(requestId)
  })

  ipcMain.handle('pty:spawn', (_e, paneId: string, cols: number, rows: number, cwd?: string, cmd?: string, args?: string[]) => {
    getTerminals().spawn(paneId, cols, rows, cwd, cmd, args)
  })

  ipcMain.handle('pty:write', (_e, paneId: string, data: string) => {
    getTerminals().write(paneId, data)
  })

  ipcMain.handle('pty:resize', (_e, paneId: string, cols: number, rows: number) => {
    getTerminals().resize(paneId, cols, rows)
  })

  ipcMain.handle('pty:dispose', (_e, paneId: string) => {
    getTerminals().dispose(paneId)
  })

  ipcMain.handle(
    'browser:layout',
    (_e, paneId: string, bounds: Electron.Rectangle) => {
      getBrowserPanes().layout(paneId, bounds)
    }
  )

  ipcMain.handle('browser:navigate', (_e, paneId: string, url: string) => {
    getBrowserPanes().navigate(paneId, url)
  })

  ipcMain.handle('browser:goBack', (_e, paneId: string) => {
    getBrowserPanes().goBack(paneId)
  })

  ipcMain.handle('browser:goForward', (_e, paneId: string) => {
    getBrowserPanes().goForward(paneId)
  })

  ipcMain.handle('browser:stop', (_e, paneId: string) => {
    getBrowserPanes().stop(paneId)
  })

  ipcMain.handle('browser:getHistory', (_e, paneId: string) => {
    return getBrowserPanes().getHistory(paneId)
  })

  ipcMain.handle('browser:clearHistory', (_e, paneId: string) => {
    getBrowserPanes().clearHistory(paneId)
  })

  ipcMain.handle('browser:suspend', (_e, paneId: string) => {
    getBrowserPanes().suspend(paneId)
  })

  ipcMain.handle('browser:destroy', (_e, paneId: string) => {
    getBrowserPanes().destroy(paneId)
  })

  ipcMain.handle('browser:reload', (_e, paneId: string) => {
    getBrowserPanes().reload(paneId)
  })

  ipcMain.handle('browser:harStart', (_e, paneId: string) => {
    getBrowserPanes().harStart(paneId)
  })

  ipcMain.handle('browser:harStop', (_e, paneId: string) => {
    getBrowserPanes().harStop(paneId)
  })

  ipcMain.handle('browser:harGetData', (_e, paneId: string) => {
    return getBrowserPanes().harGetData(paneId)
  })

  ipcMain.handle('browser:harIsRecording', (_e, paneId: string) => {
    return getBrowserPanes().harIsRecording(paneId)
  })

  ipcMain.handle('browser:harGetEntryCount', (_e, paneId: string) => {
    return getBrowserPanes().harGetEntryCount(paneId)
  })

  ipcMain.handle('browser:openDevTools', (_e, paneId: string) => {
    getBrowserPanes().openDevTools(paneId)
  })

  ipcMain.handle('browser:setZoom', (_e, paneId: string, delta: number) => {
    return getBrowserPanes().setZoom(paneId, delta)
  })

  ipcMain.handle('browser:resetZoom', (_e, paneId: string) => {
    getBrowserPanes().resetZoom(paneId)
  })

  ipcMain.handle('browser:findInPage', (_e, paneId: string, text: string, forward: boolean) => {
    getBrowserPanes().findInPage(paneId, text, forward)
  })

  ipcMain.handle('browser:stopFindInPage', (_e, paneId: string) => {
    getBrowserPanes().stopFindInPage(paneId)
  })

  ipcMain.handle('browser:getPageInfo', async (_e, paneId: string) => {
    return getBrowserPanes().getPageInfo(paneId)
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (isNavigationAllowed(url)) await shell.openExternal(url)
  })

  ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
    const abs = normalize(resolve(filePath))
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
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:renameWorkspace', (_e, wsId: string, name: string) => {
    stateStore!.renameWorkspace(wsId, name)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('state:deleteWorkspace', (_e, wsId: string) => {
    stateStore!.deleteWorkspace(wsId)
    return stateStore!.getSnapshot()
  })

  ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
    const { rename } = await import('node:fs/promises')
    await rename(oldPath, newPath)
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

  registerIpcHandlers()

  await win.loadURL(appEntryUrl())

  if (!app.isPackaged) {
    win.webContents.openDevTools()
  }

  win.on('closed', () => {
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
