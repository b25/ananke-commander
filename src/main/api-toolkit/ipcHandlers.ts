/**
 * ipcHandlers.ts — registers all API Toolkit IPC channels into Ananke's main process.
 * Idempotent: call once at startup; subsequent calls are no-ops.
 */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import { IPC } from '../../shared/api-toolkit-contracts.js'
import type { HttpRequest, GrpcRequest, Collection, CollectionItem, Environment, HistoryEntry } from '../../shared/api-toolkit-contracts.js'
import { sendHttp, cancelHttp } from './http-client.js'
import { discoverProto, grpcUnary, grpcStream } from './grpc-engine.js'
import * as storage from './storage.js'
import { toCurl, fromCurl } from './curl-utils.js'

let registered = false

export function registerApiToolkitHandlers(): void {
  if (registered) return
  registered = true

  // ─── HTTP ──────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.HTTP_SEND, async (_e, id: string, req: HttpRequest) => {
    try {
      return await sendHttp(id, req)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // Map common Node/undici network errors to user-facing messages
      const userMessage = msg.includes('ECONNREFUSED')
        ? `Connection refused — is the server running at ${req.url}?`
        : msg.includes('ETIMEDOUT') || msg.includes('timed out')
          ? `Request timed out after ${req.timeout > 0 ? req.timeout : 30000}ms`
          : msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')
            ? `Could not resolve host — check the URL`
            : msg
      throw new Error(userMessage)
    }
  })
  ipcMain.on(IPC.HTTP_CANCEL, (_e, id: string) => cancelHttp(id))

  // ─── gRPC ──────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GRPC_DISCOVER, async (_e, req: GrpcRequest) => {
    try {
      return await discoverProto(req)
    } catch (e: unknown) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })
  ipcMain.handle(IPC.GRPC_UNARY, async (_e, req: GrpcRequest) => {
    try {
      return await grpcUnary(req)
    } catch (e: unknown) {
      throw new Error(e instanceof Error ? e.message : String(e))
    }
  })

  const activeStreams = new Map<string, { cancel: () => void; sendMessage: (j: string) => void }>()

  ipcMain.on(IPC.GRPC_STREAM_START, async (event, streamId: string, req: GrpcRequest) => {
    const send = (channel: string, ...args: unknown[]) =>
      event.sender.send(channel, streamId, ...args)
    try {
      const handle = await grpcStream(req, {
        onMessage: (msg) => send(IPC.GRPC_STREAM_MESSAGE, msg),
        onEnd: (status, trailers) => { send(IPC.GRPC_STREAM_END, status, trailers); activeStreams.delete(streamId) },
        onError: (err) => { send(IPC.GRPC_STREAM_ERROR, err); activeStreams.delete(streamId) },
      })
      activeStreams.set(streamId, handle)
    } catch (e) {
      send(IPC.GRPC_STREAM_ERROR, String(e))
    }
  })

  ipcMain.on(IPC.GRPC_STREAM_SEND, (_e, streamId: string, jsonStr: string) =>
    activeStreams.get(streamId)?.sendMessage(jsonStr))

  ipcMain.on(IPC.GRPC_STREAM_CANCEL, (_e, streamId: string) => {
    activeStreams.get(streamId)?.cancel()
    activeStreams.delete(streamId)
  })

  // ─── Storage ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.STORAGE_GET_COLLECTIONS, () => storage.getCollections())
  ipcMain.handle(IPC.STORAGE_SAVE_COLLECTION, (_e, col: Collection) => storage.saveCollection(col))
  ipcMain.handle(IPC.STORAGE_DELETE_COLLECTION, (_e, id: string) => storage.deleteCollection(id))
  ipcMain.handle(IPC.STORAGE_ADD_COLLECTION_ITEM, (_e, colId: string, item: CollectionItem, parentId?: string) =>
    storage.addCollectionItem(colId, item, parentId))
  ipcMain.handle(IPC.STORAGE_UPDATE_COLLECTION_ITEM, (_e, colId: string, itemId: string, patch: Partial<CollectionItem>) =>
    storage.updateCollectionItem(colId, itemId, patch))
  ipcMain.handle(IPC.STORAGE_DELETE_COLLECTION_ITEM, (_e, colId: string, itemId: string) =>
    storage.deleteCollectionItem(colId, itemId))
  ipcMain.handle(IPC.STORAGE_IMPORT_COLLECTION, (_e, jsonStr: string) =>
    storage.importPostmanCollection(jsonStr))

  ipcMain.handle(IPC.STORAGE_GET_ENVIRONMENTS, () => storage.getEnvironments())
  ipcMain.handle(IPC.STORAGE_SAVE_ENVIRONMENT, (_e, env: Environment) => storage.saveEnvironment(env))
  ipcMain.handle(IPC.STORAGE_DELETE_ENVIRONMENT, (_e, id: string) => storage.deleteEnvironment(id))

  ipcMain.handle(IPC.STORAGE_GET_HISTORY, () => storage.getHistory())
  ipcMain.handle(IPC.STORAGE_ADD_HISTORY, (_e, entry: HistoryEntry) => storage.addHistory(entry))
  ipcMain.handle(IPC.STORAGE_CLEAR_HISTORY, () => storage.clearHistory())

  // ─── Export / import utilities ─────────────────────────────────────────────

  ipcMain.handle(IPC.STORAGE_EXPORT_COLLECTION, (_e, colId: string) =>
    storage.exportPostmanCollection(colId))
  ipcMain.handle(IPC.UTIL_CURL_TO, (_e, req: import('../../shared/api-toolkit-contracts.js').HttpRequest) =>
    toCurl(req))
  ipcMain.handle(IPC.UTIL_CURL_FROM, (_e, curlStr: string) =>
    fromCurl(curlStr))

  // ─── Dialogs ───────────────────────────────────────────────────────────────

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
