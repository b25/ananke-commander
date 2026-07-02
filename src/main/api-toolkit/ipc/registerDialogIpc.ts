import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import { IPC } from '../../../shared/api-toolkit-contracts.js'

/** Native open/save dialogs used by the API toolkit (proto picker, generic file open/save). */
export function registerDialogIpc(): void {
  ipcMain.handle(IPC.DIALOG_OPEN_PROTO, async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Select .proto files',
      filters: [{ name: 'Protocol Buffer', extensions: ['proto'] }, { name: 'All Files', extensions: ['*'] }],
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return null
    const MAX_PROTO_SIZE = 2 * 1024 * 1024 // 2 MB
    const { statSync } = await import('node:fs')
    for (const p of result.filePaths) {
      const { size } = statSync(p)
      if (size > MAX_PROTO_SIZE) {
        throw new Error(`File "${p.split('/').pop()}" exceeds the 2 MB limit (${(size / 1024 / 1024).toFixed(1)} MB)`)
      }
    }
    return result.filePaths.map((p) => ({
      name: p.split('/').pop()!,
      content: readFileSync(p, 'utf8'),
      fullPath: p,
    }))
  })

  ipcMain.handle(IPC.DIALOG_OPEN_FILE, async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'] })
    if (result.canceled) return null
    return readFileSync(result.filePaths[0], 'utf8')
  })

  /** Returns the chosen file's path and name without reading its contents.
   *  Used by the binary and multipart body editors — the actual read happens in the main process at send time. */
  ipcMain.handle(IPC.DIALOG_OPEN_FILE_PATH, async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openFile'] })
    if (result.canceled) return null
    const filePath = result.filePaths[0]
    return { path: filePath, name: filePath.split('/').pop() ?? filePath }
  })

  ipcMain.handle(IPC.DIALOG_SAVE_FILE, async (_e, content: string, defaultName: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    const result = await dialog.showSaveDialog(win, { defaultPath: defaultName })
    if (result.canceled || !result.filePath) return false
    const { writeFileSync } = await import('node:fs')
    writeFileSync(result.filePath, content, 'utf8')
    return true
  })
}
