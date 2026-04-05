import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parentPort } from 'node:worker_threads'
import type { FolderSizeRequest } from '../../shared/contracts.js'

const cancelled = new Map<string, boolean>()

async function walkAndSum(
  dirPath: string,
  requestId: string,
  onProgress: (partialSize: number, filesScanned: number) => void
): Promise<number> {
  let totalSize = 0
  let filesScanned = 0
  let lastProgressTime = Date.now()

  async function walk(dir: string): Promise<void> {
    if (cancelled.get(requestId)) return

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      // Skip directories we cannot read (permission errors)
      return
    }

    for (const entry of entries) {
      if (cancelled.get(requestId)) return

      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        await walk(fullPath)
      } else {
        try {
          const st = await stat(fullPath)
          totalSize += st.size
          filesScanned += 1

          const now = Date.now()
          if (filesScanned % 50 === 0 || now - lastProgressTime >= 100) {
            lastProgressTime = now
            onProgress(totalSize, filesScanned)
          }
        } catch {
          // Skip files we cannot stat (permission errors, broken symlinks)
        }
      }
    }
  }

  await walk(dirPath)
  return totalSize
}

parentPort?.on('message', async (msg: FolderSizeRequest & { type?: string }) => {
  // Handle cancel messages
  if (msg.type === 'cancel') {
    cancelled.set(msg.requestId, true)
    return
  }

  const { requestId, dirPath } = msg
  cancelled.set(requestId, false)

  try {
    const totalSize = await walkAndSum(dirPath, requestId, (partialSize, filesScanned) => {
      if (cancelled.get(requestId)) return
      parentPort?.postMessage({
        type: 'progress',
        requestId,
        dirPath,
        partialSize,
        filesScanned
      })
    })

    if (!cancelled.get(requestId)) {
      parentPort?.postMessage({
        type: 'done',
        requestId,
        dirPath,
        totalSize
      })
    }
  } catch (e) {
    if (!cancelled.get(requestId)) {
      parentPort?.postMessage({
        type: 'error',
        requestId,
        dirPath,
        message: e instanceof Error ? e.message : String(e)
      })
    }
  } finally {
    cancelled.delete(requestId)
  }
})
