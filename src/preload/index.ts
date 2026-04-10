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
    setActivePane: (workspaceId: string, paneId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:setActivePane', workspaceId, paneId),
    updatePane: (workspaceId: string, paneId: string, next: PaneState): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:updatePane', workspaceId, paneId, next),
    closePane: (workspaceId: string, paneId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:closePane', workspaceId, paneId),
    removeRecentlyClosed: (entryId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:removeRecentlyClosed', entryId),
    restoreClosed: (workspaceId: string, entryId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:restoreClosed', workspaceId, entryId),
    purgeRecentlyClosed: (): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:purgeRecentlyClosed'),
    setCanvasOffset: (wsId: string, x: number, y: number): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:setCanvasOffset', wsId, x, y),
    setScreenLayout: (wsId: string, screenIndex: number, layoutId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:setScreenLayout', wsId, screenIndex, layoutId),
    setIntentLayout: (wsId: string, screenIndex: number, layoutId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:setIntentLayout', wsId, screenIndex, layoutId),
    setScreenCollapsed: (wsId: string, screenIndex: number, ids: string[]): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:setScreenCollapsed', wsId, screenIndex, ids),
    cloneWorkspace: (wsId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:cloneWorkspace', wsId),
    renameWorkspace: (wsId: string, name: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:renameWorkspace', wsId, name),
    deleteWorkspace: (wsId: string): Promise<AppStateSnapshot> =>
      ipcRenderer.invoke('state:deleteWorkspace', wsId)
  },

  fs: {
    listDir: (dirPath: string): Promise<ListDirEntry[]> => ipcRenderer.invoke('fs:listDir', dirPath),
    quickOp: (op: 'mkdir' | 'delete', target: string, paths?: string[]) =>
      ipcRenderer.invoke('fs:quickOp', op, target, paths),
    readUtf8: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readUtf8', filePath),
    writeUtf8: (filePath: string, text: string) => ipcRenderer.invoke('fs:writeUtf8', filePath, text),
    startFolderSize: (dirPath: string): Promise<string> =>
      ipcRenderer.invoke('fs:startFolderSize', dirPath),
    cancelFolderSize: (requestId: string): Promise<void> =>
      ipcRenderer.invoke('fs:cancelFolderSize', requestId),
    onFolderSizeProgress: (cb: (msg: { requestId: string; dirPath: string; partialSize: number; filesScanned: number }) => void) => {
      const fn = (_: unknown, msg: { requestId: string; dirPath: string; partialSize: number; filesScanned: number }) => cb(msg)
      ipcRenderer.on('fs:folderSize:progress', fn)
      return () => ipcRenderer.removeListener('fs:folderSize:progress', fn)
    },
    onFolderSizeDone: (cb: (msg: { requestId: string; dirPath: string; totalSize: number }) => void) => {
      const fn = (_: unknown, msg: { requestId: string; dirPath: string; totalSize: number }) => cb(msg)
      ipcRenderer.on('fs:folderSize:done', fn)
      return () => ipcRenderer.removeListener('fs:folderSize:done', fn)
    },
    onFolderSizeError: (cb: (msg: { requestId: string; dirPath: string; message: string }) => void) => {
      const fn = (_: unknown, msg: { requestId: string; dirPath: string; message: string }) => cb(msg)
      ipcRenderer.on('fs:folderSize:error', fn)
      return () => ipcRenderer.removeListener('fs:folderSize:error', fn)
    },
    rename: (oldPath: string, newPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:rename', oldPath, newPath)
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
      bounds: { x: number; y: number; width: number; height: number }
    ) => ipcRenderer.invoke('browser:layout', paneId, bounds),
    navigate: (paneId: string, url: string) => ipcRenderer.invoke('browser:navigate', paneId, url),
    goBack: (paneId: string) => ipcRenderer.invoke('browser:goBack', paneId),
    goForward: (paneId: string) => ipcRenderer.invoke('browser:goForward', paneId),
    stop: (paneId: string) => ipcRenderer.invoke('browser:stop', paneId),
    getHistory: (paneId: string): Promise<string[]> => ipcRenderer.invoke('browser:getHistory', paneId),
    onHistory: (cb: (msg: { paneId: string; urls: string[] }) => void) => {
      const fn = (_: unknown, msg: { paneId: string; urls: string[] }) => cb(msg)
      ipcRenderer.on('browser:history', fn)
      return () => ipcRenderer.removeListener('browser:history', fn)
    },
    reload: (paneId: string) => ipcRenderer.invoke('browser:reload', paneId),
    destroy: (paneId: string) => ipcRenderer.invoke('browser:destroy', paneId),
    onTitleUpdate: (cb: (msg: { paneId: string; title: string }) => void) => {
      const fn = (_: unknown, msg: { paneId: string; title: string }) => cb(msg)
      ipcRenderer.on('browser:titleUpdate', fn)
      return () => ipcRenderer.removeListener('browser:titleUpdate', fn)
    },
    onLoadingState: (cb: (msg: { paneId: string; loading: boolean }) => void) => {
      const fn = (_: unknown, msg: { paneId: string; loading: boolean }) => cb(msg)
      ipcRenderer.on('browser:loadingState', fn)
      return () => ipcRenderer.removeListener('browser:loadingState', fn)
    }
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
  },

  config: {
    getTomlPath: (): Promise<string> => ipcRenderer.invoke('config:getTomlPath'),
    openToml: (): Promise<string> => ipcRenderer.invoke('config:openToml'),
    writeToml: (): Promise<void> => ipcRenderer.invoke('config:writeToml'),
    onStateChanged: (cb: (snap: AppStateSnapshot) => void): (() => void) => {
      const fn = (_: unknown, snap: AppStateSnapshot) => cb(snap)
      ipcRenderer.on('config:state-changed', fn)
      return () => ipcRenderer.removeListener('config:state-changed', fn)
    },
    onTomlError: (cb: (msg: string) => void): (() => void) => {
      const fn = (_: unknown, msg: string) => cb(msg)
      ipcRenderer.on('config:toml-error', fn)
      return () => ipcRenderer.removeListener('config:toml-error', fn)
    }
  }
}

contextBridge.exposeInMainWorld('ananke', api)

export type AnankeApi = typeof api
