import { contextBridge, ipcRenderer } from 'electron'
import type { AppStateSnapshot, ListDirEntry, PaneState } from '../shared/contracts.js'

const api = {
  getPath: (name: 'home' | 'documents' | 'downloads' | 'userData') =>
    ipcRenderer.invoke('app:getPath', name),

  state: {
    get: (): Promise<AppStateSnapshot> => ipcRenderer.invoke('state:get'),
    set: (patch: Partial<AppStateSnapshot>): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:set', patch),
    replacePanes: (
      wsId: string,
      panes: PaneState[],
      activeId: string | null
    ): Promise<AppStateSnapshot> => ipcRenderer.invoke('state:replacePanes', wsId, panes, activeId),
    addWorkspace: (name: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:addWorkspace', name),
    setActiveWorkspace: (id: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:setActiveWorkspace', id),
    closePane: (workspaceId: string, paneId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:closePane', workspaceId, paneId),
    removeRecentlyClosed: (entryId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:removeRecentlyClosed', entryId),
    restoreClosed: (workspaceId: string, entryId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:restoreClosed', workspaceId, entryId),
    purgeRecentlyClosed: (): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:purgeRecentlyClosed')
  },

  fs: {
    listDir: (dirPath: string): Promise<ListDirEntry[]> => ipcRenderer.invoke('fs:listDir', dirPath),
    quickOp: (op: 'mkdir' | 'delete', target: string, paths?: string[]) =>
      ipcRenderer.invoke('fs:quickOp', op, target, paths),
    readUtf8: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readUtf8', filePath),
    writeUtf8: (filePath: string, text: string) => ipcRenderer.invoke('fs:writeUtf8', filePath, text)
  },

  fileJob: {
    start: (kind: 'copy' | 'move' | 'delete', sources: string[], destDir?: string): Promise<string> =>
      ipcRenderer.invoke('fileJob:start', kind, sources, destDir),
    cancel: (): Promise<void> => ipcRenderer.invoke('fileJob:cancel'),
    onProgress: (cb: (msg: Record<string, unknown>) => void) => {
      const fn = (_: unknown, msg: Record<string, unknown>) => cb(msg)
      ipcRenderer.on('file-job:progress', fn)
      return () => ipcRenderer.removeListener('file-job:progress', fn)
    },
    onDone: (cb: (msg: { jobId: string }) => void) => {
      const fn = (_: unknown, msg: { jobId: string }) => cb(msg)
      ipcRenderer.on('file-job:done', fn)
      return () => ipcRenderer.removeListener('file-job:done', fn)
    },
    onError: (cb: (msg: { jobId: string; message: string }) => void) => {
      const fn = (_: unknown, msg: { jobId: string; message: string }) => cb(msg)
      ipcRenderer.on('file-job:error', fn)
      return () => ipcRenderer.removeListener('file-job:error', fn)
    }
  },

  pty: {
    spawn: (paneId: string, cols: number, rows: number, cwd?: string) =>
      ipcRenderer.invoke('pty:spawn', paneId, cols, rows, cwd),
    write: (paneId: string, data: string) => ipcRenderer.invoke('pty:write', paneId, data),
    resize: (paneId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:resize', paneId, cols, rows),
    dispose: (paneId: string) => ipcRenderer.invoke('pty:dispose', paneId),
    onData: (cb: (msg: { paneId: string; data: string }) => void) => {
      const fn = (_: unknown, msg: { paneId: string; data: string }) => cb(msg)
      ipcRenderer.on('pty:data', fn)
      return () => ipcRenderer.removeListener('pty:data', fn)
    },
    onExit: (cb: (msg: { paneId: string; exitCode: number }) => void) => {
      const fn = (_: unknown, msg: { paneId: string; exitCode: number }) => cb(msg)
      ipcRenderer.on('pty:exit', fn)
      return () => ipcRenderer.removeListener('pty:exit', fn)
    }
  },

  browser: {
    layout: (
      paneId: string,
      url: string,
      bounds: { x: number; y: number; width: number; height: number }
    ) => ipcRenderer.invoke('browser:layout', paneId, url, bounds),
    getHistory: (paneId: string): Promise<string[]> => ipcRenderer.invoke('browser:getHistory', paneId),
    onHistory: (cb: (msg: { paneId: string; urls: string[] }) => void) => {
      const fn = (_: unknown, msg: { paneId: string; urls: string[] }) => cb(msg)
      ipcRenderer.on('browser:history', fn)
      return () => ipcRenderer.removeListener('browser:history', fn)
    },
    destroy: (paneId: string) => ipcRenderer.invoke('browser:destroy', paneId)
  },

  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    /** Empty string on success; otherwise an error message from the OS. */
    openPath: (filePath: string): Promise<string> => ipcRenderer.invoke('shell:openPath', filePath)
  },

  dialog: {
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDirectory'),
    saveFile: (defaultName: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:saveFile', defaultName)
  },

  archive: {
    pack: (format: 'zip' | 'tgz', sources: string[], outFile: string) =>
      ipcRenderer.invoke('archive:pack', format, sources, outFile),
    unpack: (format: 'zip' | 'tgz', archivePath: string, outDir: string) =>
      ipcRenderer.invoke('archive:unpack', format, archivePath, outDir)
  },

  notes: {
    saveVault: (vaultPath: string, subfolder: string, filename: string, body: string) =>
      ipcRenderer.invoke('notes:saveVault', vaultPath, subfolder, filename, body)
  },

  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text)
  }
}

contextBridge.exposeInMainWorld('ananke', api)

export type AnankeApi = typeof api
