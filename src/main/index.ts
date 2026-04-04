import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, Menu } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readdir, stat, rm, writeFile, readFile, rename } from 'node:fs/promises'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  registerPrivilegedAppScheme,
  registerAppProtocolHandler,
  appEntryUrl
} from './protocol/registerAppProtocol.js'
import { StateStore } from './store/stateStore.js'
import { FileJobManager } from './jobs/fileJobManager.js'
import { TerminalManager } from './pty/terminalManager.js'
import { BrowserPaneManager } from './browser/browserPaneManager.js'
import { isNavigationAllowed } from './security/browserSecurity.js'
import * as archive from './archive/archiveService.js'
import { saveMarkdownToVault } from './notes/notesService.js'
import type { AppStateSnapshot, PaneState } from '../shared/contracts.js'
import { randomUUID } from 'node:crypto'
import { installAppMenu } from './menu.js'

registerPrivilegedAppScheme()

let mainWindow: BrowserWindow | null = null
let stateStore: StateStore | null = null
let fileJobs: FileJobManager | null = null
let terminals: TerminalManager | null = null
let browserPanes: BrowserPaneManager | null = null

let protocolRegistered = false
let ipcRegistered = false

function rendererDist(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../renderer')
}

function preloadScriptPath(): string {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../preload')
  const cjs = join(dir, 'index.cjs')
  if (existsSync(cjs)) return cjs
  const mjs = join(dir, 'index.mjs')
  if (existsSync(mjs)) return mjs
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
    if (pane?.type === 'terminal') terminals!.dispose(paneId)
    if (pane?.type === 'browser') browserPanes!.destroy(paneId)
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

  ipcMain.handle('fs:writeUtf8', async (_e, filePath: string, text: string) => {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, text, 'utf8')
  })

  ipcMain.handle('fs:readUtf8', async (_e, filePath: string) => {
    return await readFile(filePath, 'utf8')
  })

  ipcMain.handle('fs:listDir', async (_e, dirPath: string) => {
    const abs = resolve(dirPath)
    const entries = await readdir(abs, { withFileTypes: true }).catch(() => [])
    const out = await Promise.all(
      entries.map(async (e) => {
        const p = join(abs, e.name)
        const st = await stat(p).catch(() => null)
        return {
          name: e.name,
          path: p,
          isDirectory: e.isDirectory(),
          size: st?.size ?? 0,
          mtimeMs: st?.mtimeMs ?? 0
        }
      })
    )
    out.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return out
  })

  ipcMain.handle('fs:getFolderSize', async (_e, dirPath: string) => {
    const abs = resolve(dirPath)
    let total = 0
    async function calc(p: string) {
      try {
        const s = await stat(p)
        if (s.isDirectory()) {
          const ents = await readdir(p, { withFileTypes: true })
          await Promise.all(ents.map(e => calc(join(p, e.name))))
        } else {
          total += s.size
        }
      } catch {
        // ignore access errors
      }
    }
    await calc(abs)
    return total
  })

  ipcMain.handle(
    'fs:quickOp',
    async (_e, op: 'mkdir' | 'delete' | 'rename', target: string, paths?: string[], newName?: string) => {
      if (op === 'mkdir') {
        await mkdir(target, { recursive: true })
        return
      }
      if (op === 'rename' && newName) {
        await rename(resolve(target), resolve(dirname(target), newName))
        return
      }
      if (paths?.length) {
        for (const p of paths) await rm(resolve(p), { recursive: true, force: true })
      }
    }
  )

  ipcMain.handle(
    'fileJob:start',
    (_e, kind: 'copy' | 'move' | 'delete', sources: string[], destDir?: string) => {
      if (kind === 'delete') {
        return fileJobs!.runJob('delete', sources.map((s) => resolve(s)))
      }
      if (!destDir) throw new Error('destDir required')
      return fileJobs!.runJob(kind, sources.map((s) => resolve(s)), resolve(destDir))
    }
  )

  ipcMain.handle('fileJob:cancel', () => {
    fileJobs!.cancel()
  })

  ipcMain.handle('pty:spawn', (_e, paneId: string, cols: number, rows: number, cwd?: string) => {
    terminals!.spawn(paneId, cols, rows, cwd)
  })

  ipcMain.handle('pty:write', (_e, paneId: string, data: string) => {
    terminals!.write(paneId, data)
  })

  ipcMain.handle('pty:resize', (_e, paneId: string, cols: number, rows: number) => {
    terminals!.resize(paneId, cols, rows)
  })

  ipcMain.handle('pty:dispose', (_e, paneId: string) => {
    terminals!.dispose(paneId)
  })

  ipcMain.handle(
    'browser:layout',
    (_e, paneId: string, bounds: Electron.Rectangle) => {
      browserPanes!.layout(paneId, bounds)
    }
  )

  ipcMain.handle('browser:navigate', (_e, paneId: string, url: string) => {
    browserPanes!.navigate(paneId, url)
  })

  ipcMain.handle('browser:goBack', (_e, paneId: string) => {
    browserPanes!.goBack(paneId)
  })

  ipcMain.handle('browser:goForward', (_e, paneId: string) => {
    browserPanes!.goForward(paneId)
  })

  ipcMain.handle('browser:stop', (_e, paneId: string) => {
    browserPanes!.stop(paneId)
  })

  ipcMain.handle('browser:getHistory', (_e, paneId: string) => {
    return browserPanes!.getHistory(paneId)
  })

  ipcMain.handle('browser:destroy', (_e, paneId: string) => {
    browserPanes!.destroy(paneId)
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (isNavigationAllowed(url)) await shell.openExternal(url)
  })

  ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
    const abs = normalize(resolve(filePath))
    return shell.openPath(abs)
  })

  ipcMain.handle('shell:popTerminalMenu', () => {
    const win = focusedOrMain()
    if (!win) return
    const template = [
      { role: 'copy' as const },
      { role: 'paste' as const }
    ]
    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: win })
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
  fileJobs = new FileJobManager(win)
  terminals = new TerminalManager(win)
  browserPanes = new BrowserPaneManager(win, {
    maxEntries: () => stateStore!.getSettings().privacy.browserHistoryMax,
    shouldRecord: () => !stateStore!.getSettings().privacy.privateMode,
    onHistory: (paneId, urls) => {
      if (!win.isDestroyed()) {
        win.webContents.send('browser:history', { paneId, urls })
      }
    }
  })

  registerIpcHandlers()

  await win.loadURL(appEntryUrl())
  win.webContents.openDevTools({ mode: 'detach' })

  win.on('closed', () => {
    fileJobs?.dispose()
    fileJobs = null
    terminals?.disposeAll()
    terminals = null
    browserPanes?.destroyAll()
    browserPanes = null
    stateStore = null
    mainWindow = null
  })
}

app.whenReady().then(() => {
  installAppMenu()
  void createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
