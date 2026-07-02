import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { FileJobKind, FileJobPayload } from '../../shared/contracts.js'

export class FileJobManager {
  private win: BrowserWindow
  private worker: Worker | null = null
  private runningJobId: string | null = null
  private readonly workerFactory: () => Worker

  constructor(win: BrowserWindow, workerFactory?: () => Worker) {
    this.win = win
    const workerPath = this.getWorkerPath()
    this.workerFactory = workerFactory ?? (() => new Worker(workerPath))
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

    worker.on('error', (err: Error) => {
      // Worker threw an unhandled exception / failed to load its bundle.
      // Null it out so the next runJob() spawns a fresh one.
      if (this.worker === worker) this.worker = null
      if (this.runningJobId !== null) {
        const jobId = this.runningJobId
        this.runningJobId = null
        if (!this.win.isDestroyed()) {
          this.win.webContents.send('file-job:error', { jobId, message: err.message })
        }
      }
    })

    worker.on('exit', (code: number) => {
      // After an 'error' event Node also emits 'exit'; the error handler already
      // cleared runningJobId and nulled this.worker, so both guards below are
      // no-ops in that path — no double-emit.
      if (this.worker === worker) this.worker = null   // force respawn on next job
      if (code !== 0 && this.runningJobId !== null) {
        const jobId = this.runningJobId
        this.runningJobId = null
        if (!this.win.isDestroyed()) {
          this.win.webContents.send('file-job:error', {
            jobId,
            message: `Worker exited unexpectedly (code ${code})`
          })
        }
      }
    })
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = this.workerFactory()
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
