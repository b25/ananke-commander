/**
 * ipcHandlers.ts — registers all API Toolkit IPC channels into Ananke's main process.
 * Idempotent: call once at startup; subsequent calls are no-ops. Each domain lives in its
 * own registrar under ./ipc/ (http, grpc, storage, dialog, mock).
 */
import { registerHttpIpc } from './ipc/registerHttpIpc.js'
import { registerGrpcIpc } from './ipc/registerGrpcIpc.js'
import { registerStorageIpc } from './ipc/registerStorageIpc.js'
import { registerDialogIpc } from './ipc/registerDialogIpc.js'
import { registerMockIpc } from './ipc/registerMockIpc.js'

let registered = false

export function registerApiToolkitHandlers(): void {
  if (registered) return
  registered = true

  registerHttpIpc()
  registerGrpcIpc()
  registerStorageIpc()
  registerDialogIpc()
  registerMockIpc()
}
