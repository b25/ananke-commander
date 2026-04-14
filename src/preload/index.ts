import { contextBridge, ipcRenderer } from 'electron'
import type { AppStateSnapshot, ListDirEntry, PaneState, TerminalSessionMeta } from '../shared/contracts.js'
import type {
  HttpRequest, HttpResponse,
  GrpcRequest, GrpcResponse, GrpcMessage, GrpcStatus, ProtoDiscovery,
  Collection, CollectionItem, Environment, HistoryEntry,
} from '../shared/api-toolkit-contracts.js'

const api = {
  platform: process.platform as 'darwin' | 'win32' | 'linux',

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
      ipcRenderer.invoke('fs:rename', oldPath, newPath),
    chmod: (filePath: string, mode: string): Promise<void> =>
      ipcRenderer.invoke('fs:chmod', filePath, mode),
    createFile: (filePath: string): Promise<void> =>
      ipcRenderer.invoke('fs:createFile', filePath)
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
    spawn: (paneId: string, cols: number, rows: number, cwd?: string, cmd?: string, args?: string[]) =>
      ipcRenderer.invoke('pty:spawn', paneId, cols, rows, cwd, cmd, args),
    write: (paneId: string, data: string) => ipcRenderer.invoke('pty:write', paneId, data),
    resize: (paneId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pty:resize', paneId, cols, rows),
    dispose: (paneId: string) => ipcRenderer.invoke('pty:dispose', paneId),
    onData: (() => {
      const subs = new Set<(msg: { paneId: string; data: string }) => void>()
      ipcRenderer.on('pty:data', (_: unknown, msg: { paneId: string; data: string }) => {
        subs.forEach(cb => cb(msg))
      })
      return (cb: (msg: { paneId: string; data: string }) => void) => {
        subs.add(cb)
        return () => subs.delete(cb)
      }
    })(),
    onExit: (() => {
      const subs = new Set<(msg: { paneId: string; exitCode: number }) => void>()
      ipcRenderer.on('pty:exit', (_: unknown, msg: { paneId: string; exitCode: number }) => {
        subs.forEach(cb => cb(msg))
      })
      return (cb: (msg: { paneId: string; exitCode: number }) => void) => {
        subs.add(cb)
        return () => subs.delete(cb)
      }
    })()
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
    getHistory: (paneId: string): Promise<Array<{ url: string; timestamp: number }>> =>
      ipcRenderer.invoke('browser:getHistory', paneId),
    onHistory: (cb: (msg: { paneId: string; entries: Array<{ url: string; timestamp: number }> }) => void) => {
      const fn = (_: unknown, msg: { paneId: string; entries: Array<{ url: string; timestamp: number }> }) => cb(msg)
      ipcRenderer.on('browser:history', fn)
      return () => ipcRenderer.removeListener('browser:history', fn)
    },
    clearHistory: (paneId: string) => ipcRenderer.invoke('browser:clearHistory', paneId),
    reload: (paneId: string) => ipcRenderer.invoke('browser:reload', paneId),
    suspend: (paneId: string) => ipcRenderer.invoke('browser:suspend', paneId),
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
    },
    onUrlUpdate: (cb: (msg: { paneId: string; url: string }) => void) => {
      const fn = (_: unknown, msg: { paneId: string; url: string }) => cb(msg)
      ipcRenderer.on('browser:urlUpdate', fn)
      return () => ipcRenderer.removeListener('browser:urlUpdate', fn)
    },
    harStart: (paneId: string) => ipcRenderer.invoke('browser:harStart', paneId),
    harStop: (paneId: string) => ipcRenderer.invoke('browser:harStop', paneId),
    harGetData: (paneId: string): Promise<object | null> => ipcRenderer.invoke('browser:harGetData', paneId),
    harIsRecording: (paneId: string): Promise<boolean> => ipcRenderer.invoke('browser:harIsRecording', paneId),
    harGetEntryCount: (paneId: string): Promise<number> => ipcRenderer.invoke('browser:harGetEntryCount', paneId),
    openDevTools: (paneId: string) => ipcRenderer.invoke('browser:openDevTools', paneId),
    setZoom: (paneId: string, delta: number): Promise<number> => ipcRenderer.invoke('browser:setZoom', paneId, delta),
    resetZoom: (paneId: string) => ipcRenderer.invoke('browser:resetZoom', paneId),
    findInPage: (paneId: string, text: string, forward: boolean) => ipcRenderer.invoke('browser:findInPage', paneId, text, forward),
    stopFindInPage: (paneId: string) => ipcRenderer.invoke('browser:stopFindInPage', paneId),
    getPageInfo: (paneId: string): Promise<{ title: string; url: string; selectedText: string; bodyText: string } | null> =>
      ipcRenderer.invoke('browser:getPageInfo', paneId),
    onClipToVault: (cb: (msg: { paneId: string }) => void) => {
      const fn = (_: unknown, msg: { paneId: string }) => cb(msg)
      ipcRenderer.on('browser:clipToVault', fn)
      return () => ipcRenderer.removeListener('browser:clipToVault', fn)
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
      ipcRenderer.invoke('notes:saveVault', vaultPath, subfolder, filename, body),
    listVault: (vaultPath: string, subfolder: string): Promise<Array<{ filename: string; modified: number }>> =>
      ipcRenderer.invoke('notes:listVault', vaultPath, subfolder),
    readVault: (vaultPath: string, subfolder: string, filename: string): Promise<string | null> =>
      ipcRenderer.invoke('notes:readVault', vaultPath, subfolder, filename),
    deleteVault: (vaultPath: string, subfolder: string, filename: string): Promise<void> =>
      ipcRenderer.invoke('notes:deleteVault', vaultPath, subfolder, filename)
  },

  termHistory: {
    save: (meta: TerminalSessionMeta, text: string): Promise<void> =>
      ipcRenderer.invoke('termHistory:save', meta, text),
    list: (): Promise<TerminalSessionMeta[]> =>
      ipcRenderer.invoke('termHistory:list'),
    read: (id: string): Promise<string | null> =>
      ipcRenderer.invoke('termHistory:read', id),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('termHistory:delete', id),
    clear: (): Promise<void> =>
      ipcRenderer.invoke('termHistory:clear')
  },

  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text)
  },

  apiToolkit: {
    http: {
      send: (id: string, req: HttpRequest): Promise<HttpResponse> =>
        ipcRenderer.invoke('at:http:send', id, req),
      cancel: (id: string): void =>
        ipcRenderer.send('at:http:cancel', id),
    },
    grpc: {
      discover: (req: GrpcRequest): Promise<ProtoDiscovery> =>
        ipcRenderer.invoke('at:grpc:discover', req),
      unary: (req: GrpcRequest): Promise<GrpcResponse> =>
        ipcRenderer.invoke('at:grpc:unary', req),
      streamStart: (streamId: string, req: GrpcRequest): void =>
        ipcRenderer.send('at:grpc:stream:start', streamId, req),
      streamSend: (streamId: string, jsonStr: string): void =>
        ipcRenderer.send('at:grpc:stream:send', streamId, jsonStr),
      streamCancel: (streamId: string): void =>
        ipcRenderer.send('at:grpc:stream:cancel', streamId),
      onStreamMessage: (cb: (streamId: string, msg: GrpcMessage) => void) => {
        const fn = (_e: Electron.IpcRendererEvent, streamId: string, msg: GrpcMessage) => cb(streamId, msg)
        ipcRenderer.on('at:grpc:stream:message', fn)
        return () => ipcRenderer.removeListener('at:grpc:stream:message', fn)
      },
      onStreamEnd: (cb: (streamId: string, status: GrpcStatus, trailers: Record<string, string>) => void) => {
        const fn = (_e: Electron.IpcRendererEvent, streamId: string, status: GrpcStatus, trailers: Record<string, string>) => cb(streamId, status, trailers)
        ipcRenderer.on('at:grpc:stream:end', fn)
        return () => ipcRenderer.removeListener('at:grpc:stream:end', fn)
      },
      onStreamError: (cb: (streamId: string, err: string) => void) => {
        const fn = (_e: Electron.IpcRendererEvent, streamId: string, err: string) => cb(streamId, err)
        ipcRenderer.on('at:grpc:stream:error', fn)
        return () => ipcRenderer.removeListener('at:grpc:stream:error', fn)
      },
    },
    storage: {
      getCollections: (): Promise<Collection[]> => ipcRenderer.invoke('at:storage:getCollections'),
      saveCollection: (col: Collection): Promise<void> => ipcRenderer.invoke('at:storage:saveCollection', col),
      deleteCollection: (id: string): Promise<void> => ipcRenderer.invoke('at:storage:deleteCollection', id),
      addCollectionItem: (colId: string, item: CollectionItem, parentId?: string): Promise<Collection | null> =>
        ipcRenderer.invoke('at:storage:addCollectionItem', colId, item, parentId),
      updateCollectionItem: (colId: string, itemId: string, patch: Partial<CollectionItem>): Promise<Collection | null> =>
        ipcRenderer.invoke('at:storage:updateCollectionItem', colId, itemId, patch),
      deleteCollectionItem: (colId: string, itemId: string): Promise<Collection | null> =>
        ipcRenderer.invoke('at:storage:deleteCollectionItem', colId, itemId),
      importCollection: (jsonStr: string): Promise<{ collection: Collection; count: number }> =>
        ipcRenderer.invoke('at:storage:importCollection', jsonStr),
      exportCollection: (colId: string): Promise<string> =>
        ipcRenderer.invoke('at:storage:exportCollection', colId),
      getEnvironments: (): Promise<Environment[]> => ipcRenderer.invoke('at:storage:getEnvironments'),
      saveEnvironment: (env: Environment): Promise<void> => ipcRenderer.invoke('at:storage:saveEnvironment', env),
      deleteEnvironment: (id: string): Promise<void> => ipcRenderer.invoke('at:storage:deleteEnvironment', id),
      getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('at:storage:getHistory'),
      addHistory: (entry: HistoryEntry): Promise<void> => ipcRenderer.invoke('at:storage:addHistory', entry),
      clearHistory: (): Promise<void> => ipcRenderer.invoke('at:storage:clearHistory'),
    },
    curl: {
      toCurl: (req: import('../shared/api-toolkit-contracts.js').HttpRequest): Promise<string> =>
        ipcRenderer.invoke('at:util:curlTo', req),
      fromCurl: (curlStr: string): Promise<import('../shared/api-toolkit-contracts.js').HttpRequest> =>
        ipcRenderer.invoke('at:util:curlFrom', curlStr),
    },
    dialog: {
      openProto: (): Promise<Array<{ name: string; content: string; fullPath: string }> | null> =>
        ipcRenderer.invoke('at:dialog:openProto'),
      openFile: (): Promise<string | null> =>
        ipcRenderer.invoke('at:dialog:openFile'),
      saveFile: (content: string, defaultName: string): Promise<boolean> =>
        ipcRenderer.invoke('at:dialog:saveFile', content, defaultName),
    },
  },

  config: {
    getTomlPath: (): Promise<string> => ipcRenderer.invoke('config:getTomlPath'),
    openToml: (): Promise<string> => ipcRenderer.invoke('config:openToml'),
    writeToml: (): Promise<void> => ipcRenderer.invoke('config:writeToml'),
    pauseWatch: (): Promise<void> => ipcRenderer.invoke('config:pauseWatch'),
    resumeWatch: (): Promise<void> => ipcRenderer.invoke('config:resumeWatch'),
    readToml: (): Promise<string | null> => ipcRenderer.invoke('config:readToml'),
    applyToml: (raw: string): Promise<{ error: string | null; snapshot: AppStateSnapshot | null }> =>
      ipcRenderer.invoke('config:applyToml', raw),
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
