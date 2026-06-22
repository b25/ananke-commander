import { ipcMain } from 'electron'
import { IPC } from '../../../shared/api-toolkit-contracts.js'
import type { Collection, CollectionItem, Environment, HistoryEntry, HttpRequest } from '../../../shared/api-toolkit-contracts.js'
import * as storage from '../storage.js'
import { toCurl, fromCurl } from '../curl-utils.js'

/** Collections, environments, history persistence, plus import/export + cURL utilities. */
export function registerStorageIpc(): void {
  // Collections
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

  // Environments
  ipcMain.handle(IPC.STORAGE_GET_ENVIRONMENTS, () => storage.getEnvironments())
  ipcMain.handle(IPC.STORAGE_SAVE_ENVIRONMENT, (_e, env: Environment) => storage.saveEnvironment(env))
  ipcMain.handle(IPC.STORAGE_DELETE_ENVIRONMENT, (_e, id: string) => storage.deleteEnvironment(id))

  // History
  ipcMain.handle(IPC.STORAGE_GET_HISTORY, () => storage.getHistory())
  ipcMain.handle(IPC.STORAGE_ADD_HISTORY, (_e, entry: HistoryEntry) => storage.addHistory(entry))
  ipcMain.handle(IPC.STORAGE_CLEAR_HISTORY, () => storage.clearHistory())

  // Export / import utilities
  ipcMain.handle(IPC.STORAGE_EXPORT_COLLECTION, (_e, colId: string) =>
    storage.exportPostmanCollection(colId))
  ipcMain.handle(IPC.UTIL_CURL_TO, (_e, req: HttpRequest) => toCurl(req))
  ipcMain.handle(IPC.UTIL_CURL_FROM, (_e, curlStr: string) => fromCurl(curlStr))
}
