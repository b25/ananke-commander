import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { FolderSizeRequest } from '../../shared/contracts.js'

export class FolderSizeManager {
  private win: BrowserWindow
  private worker: Worker | null = null
  private activeRequests = new Map<string, string>() // requestId -> dirPath

  constructor(win: BrowserWindow) {
    this.win = win
  }

  private getWorkerPath(): string {
    const dir = dirname(fileURLToPath(import.meta.url))
    return join(dir, 'folderSizeWorker.js')
  }

  private attachWorkerListeners(worker: Worker): void {
    worker.on('message', (msg: Record<string, unknown>) => {
      if (this.win.isDestroyed()) return

      if (msg.type === 'progress') {
        this.win.webContents.send('fs:folderSize:progress', {
          requestId: msg.requestId,
          dirPath: msg.dirPath,
          partialSize: msg.partialSize,
          filesScanned: msg.filesScanned
        })
      } else if (msg.type === 'done') {
        this.activeRequests.delete(msg.requestId as string)
        this.win.webContents.send('fs:folderSize:done', {
          requestId: msg.requestId,
          dirPath: msg.dirPath,
          totalSize: msg.totalSize
        })
      } else if (msg.type === 'error') {
        this.activeRequests.delete(msg.requestId as string)
        this.win.webContents.send('fs:folderSize:error', {
          requestId: msg.requestId,
          dirPath: msg.dirPath,
          message: String(msg.message ?? 'Unknown error')
        })
      }
    })
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(this.getWorkerPath())
      this.attachWorkerListeners(this.worker)
    }
    return this.worker
  }

  start(dirPath: string): string {
    const requestId = randomUUID()
    this.activeRequests.set(requestId, dirPath)
    const payload: FolderSizeRequest = { requestId, dirPath }
    this.ensureWorker().postMessage(payload)
    return requestId
  }

  cancel(requestId: string): void {
    if (!this.activeRequests.has(requestId)) return
    this.activeRequests.delete(requestId)
    this.worker?.postMessage({ type: 'cancel', requestId })
  }

  cancelAll(): void {
    for (const requestId of this.activeRequests.keys()) {
      this.worker?.postMessage({ type: 'cancel', requestId })
    }
    this.activeRequests.clear()
  }

  dispose(): void {
    this.activeRequests.clear()
    this.worker?.terminate()
    this.worker = null
  }
}
