import { mkdir, readdir, rename, rm, stat, copyFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parentPort } from 'node:worker_threads'
import type { FileJobPayload } from '../../shared/contracts.js'

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile()) out.push(p)
    }
  }
  const st = await stat(root)
  if (st.isFile()) return [root]
  await walk(root)
  return out
}

async function copyTree(sources: string[], destDir: string, onProgress: (c: string) => void): Promise<void> {
  await mkdir(destDir, { recursive: true })
  for (const src of sources) {
    const abs = resolve(src)
    const st = await stat(abs)
    if (st.isDirectory()) {
      const files = await walkFiles(abs)
      for (const f of files) {
        const rel = relative(abs, f)
        if (rel.startsWith('..') || rel === '') continue
        const target = join(destDir, basename(abs), rel)
        await mkdir(dirname(target), { recursive: true })
        await copyFile(f, target)
        onProgress(f)
      }
    } else {
      const target = join(destDir, basename(abs))
      await copyFile(abs, target)
      onProgress(abs)
    }
  }
}

async function moveTree(sources: string[], destDir: string, onProgress: (c: string) => void): Promise<void> {
  await mkdir(destDir, { recursive: true })
  for (const src of sources) {
    const abs = resolve(src)
    const target = join(destDir, basename(abs))
    await rename(abs, target)
    onProgress(abs)
  }
}

async function deletePaths(sources: string[], onProgress: (c: string) => void): Promise<void> {
  for (const src of sources) {
    const abs = resolve(src)
    await rm(abs, { recursive: true, force: true })
    onProgress(abs)
  }
}

parentPort?.on('message', async (msg: FileJobPayload) => {
  const { jobId, kind, sources, destDir } = msg
  try {
    let done = 0
    const report = (path: string) => {
      done += 1
      parentPort?.postMessage({
        type: 'progress',
        jobId,
        done,
        total: Math.max(done, sources.length),
        current: path
      })
    }
    if (kind === 'copy') {
      if (!destDir) throw new Error('destDir required')
      await copyTree(sources, destDir, report)
    } else if (kind === 'move') {
      if (!destDir) throw new Error('destDir required')
      await moveTree(sources, destDir, report)
    } else if (kind === 'delete') {
      await deletePaths(sources, report)
    }
    parentPort?.postMessage({ type: 'done', jobId })
  } catch (e) {
    parentPort?.postMessage({
      type: 'error',
      jobId,
      message: e instanceof Error ? e.message : String(e)
    })
  }
})
