import { ipcMain } from 'electron'
import type { BrowserPaneManager } from '../browser/browserPaneManager.js'

type RegisterBrowserIpcDeps = {
  getBrowserPanes: () => BrowserPaneManager
  isPackaged: boolean
}

export function registerBrowserIpcHandlers(deps: RegisterBrowserIpcDeps): void {
  const { getBrowserPanes, isPackaged } = deps

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
    if (!isPackaged) {
      getBrowserPanes().openDevTools(paneId)
    }
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
}
