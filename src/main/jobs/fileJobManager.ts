import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { FileJobKind, FileJobPayload } from '../../shared/contracts.js'

export class FileJobManager {
  private win: BrowserWindow
  private worker: Worker | null = null
  private runningJobId: string | null = null

  constructor(win: BrowserWindow) {
    this.win = win
  }

  private getWorkerPath(): string {
    const dir = dirname(fileURLToPath(import.meta.url))
    return join(dir, 'fileOpsWorker.js')
  }

  private attachWorkerListeners(worker: Worker): void {
    worker.on('message', (msg: Record<string, unknown>) => {
      if (msg.type === 'progress') {
        this.win.webContents.send('file-job:progress', msg)
      } else if (msg.type === 'done') {
        const jobId = msg.jobId as string
        if (jobId === this.runningJobId) this.runningJobId = null
        this.win.webContents.send('file-job:done', { jobId })
      } else if (msg.type === 'error') {
        const jobId = msg.jobId as string
        if (jobId === this.runningJobId) this.runningJobId = null
        this.win.webContents.send('file-job:error', {
          jobId,
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

  runJob(kind: FileJobKind, sources: string[], destDir?: string): string {
    if (this.runningJobId !== null) {
      throw new Error('Another file operation is already in progress. Cancel it or wait until it finishes.')
    }
    const jobId = randomUUID()
    this.runningJobId = jobId
    const payload: FileJobPayload = { jobId, kind, sources, destDir }
    this.ensureWorker().postMessage(payload)
    return jobId
  }

  /** Stops the worker immediately; destination may be partially written. */
  cancel(): void {
    if (!this.runningJobId) return
    const jobId = this.runningJobId
    this.runningJobId = null
    this.worker?.terminate()
    this.worker = null
    if (!this.win.isDestroyed()) {
      this.win.webContents.send('file-job:error', { jobId, message: 'Cancelled' })
    }
  }

  dispose(): void {
    this.runningJobId = null
    this.worker?.terminate()
    this.worker = null
  }
}
