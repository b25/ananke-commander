import { app, ipcMain } from 'electron'
import { lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { assertMaxBytes, IPC_LIMITS } from './ipcLimits.js'
import type { FileJobManager } from '../jobs/fileJobManager.js'
import type { FolderSizeManager } from '../jobs/folderSizeManager.js'
import type { TerminalManager } from '../pty/terminalManager.js'

type RegisterFsIpcDeps = {
  getFileJobs: () => FileJobManager
  getFolderSizeMgr: () => FolderSizeManager
  getTerminals: () => TerminalManager
}

function globToRegex(pattern: string): RegExp {
  let p = pattern.replace(/[.+^$()|[\]\\]/g, '\\$&')
  p = p.replace(/\{([^}]+)\}/g, (_, inner: string) =>
    `(?:${inner.split(',').map((s: string) => s.trim()).join('|')})`
  )
  p = p.replace(/\*\*\/?/g, '\x00')
  p = p.replace(/\*/g, '[^\\/]*')
  p = p.replace(/\?/g, '[^\\/]')
  p = p.replace(/\x00/g, '.*')
  return new RegExp(`^${p}$`, 'i')
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1))
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: safeLimit }, async () => {
    while (true) {
      const idx = next++
      if (idx >= items.length) break
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

export function registerFsIpcHandlers(deps: RegisterFsIpcDeps): void {
  const { getFileJobs, getFolderSizeMgr, getTerminals } = deps

  ipcMain.handle('fs:readUtf8', async (_e, filePath: string) => {
    const abs = resolve(filePath)
    return readFile(abs, 'utf8')
  })

  ipcMain.handle('fs:writeUtf8', async (_e, filePath: string, text: string) => {
    assertMaxBytes('fs:writeUtf8', text, IPC_LIMITS.fsWriteUtf8)
    const abs = resolve(filePath)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, text, 'utf8')
  })

  ipcMain.handle('fs:listDir', async (_e, dirPath: string) => {
    const abs = resolve(dirPath)
    const entries = await readdir(abs, { withFileTypes: true })
    const results = await mapWithConcurrency(entries, 16, async (e) => {
      try {
        const p = join(abs, e.name)
        const st = await stat(p)
        return {
          ok: true as const,
          name: e.name,
          path: p,
          isDirectory: e.isDirectory(),
          size: st.size,
          mtimeMs: st.mtimeMs
        }
      } catch {
        return { ok: false as const }
      }
    })
    const out = results.flatMap((r) => (r.ok ? [{
      name: r.name,
      path: r.path,
      isDirectory: r.isDirectory,
      size: r.size,
      mtimeMs: r.mtimeMs
    }] : []))
    out.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return out
  })

  ipcMain.handle(
    'fs:quickOp',
    async (_e, op: 'mkdir' | 'delete', target: string, paths?: string[]) => {
      if (op === 'mkdir') {
        await mkdir(resolve(target), { recursive: true })
        return
      }
      if (paths?.length) {
        for (const p of paths) await rm(resolve(p), { recursive: true, force: true })
      }
    }
  )

  ipcMain.handle('fs:chmod', async (_e, filePath: string, mode: string) => {
    if (!/^[0-7]{3,4}$/.test(mode)) throw new Error('Invalid chmod mode (use octal, e.g. 755)')
    const { chmod } = await import('node:fs/promises')
    await chmod(resolve(filePath), parseInt(mode, 8))
  })

  ipcMain.handle('fs:createFile', async (_e, filePath: string) => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(resolve(filePath), '', { flag: 'wx' })
  })

  ipcMain.handle('fs:findFiles', async (_e, root: string, pattern: string, recursive: boolean) => {
    const abs = resolve(root)
    const regex = globToRegex(pattern || '*')
    const matchRelPath = pattern.includes('/') || pattern.includes('\\') || pattern.includes('**')
    const results: { name: string; path: string; isDirectory: boolean; size: number; mtimeMs: number }[] = []

    const MAX_FIND_DEPTH = 32

    const collect = async (dir: string, depth: number): Promise<void> => {
      if (results.length >= 5000 || depth > MAX_FIND_DEPTH) return
      let entries: import('node:fs').Dirent[]
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      await mapWithConcurrency(entries, 8, async (entry) => {
        if (results.length >= 5000) return
        const p = join(dir, entry.name)
        let st
        try {
          st = await lstat(p)
        } catch {
          return
        }
        if (st.isSymbolicLink()) return
        const isDir = st.isDirectory()
        const testStr = matchRelPath ? p.slice(abs.length + 1) : entry.name
        if (regex.test(testStr)) {
          results.push({ name: entry.name, path: p, isDirectory: isDir, size: st.size, mtimeMs: st.mtimeMs })
        }
        if (isDir && recursive) await collect(p, depth + 1)
      })
    }

    await collect(abs, 0)
    return results
  })

  ipcMain.handle(
    'fileJob:start',
    (_e, kind: 'copy' | 'move' | 'delete', sources: string[], destDir?: string) => {
      if (kind === 'delete') {
        return getFileJobs().runJob('delete', sources.map((s) => resolve(s)))
      }
      if (!destDir) throw new Error('destDir required')
      return getFileJobs().runJob(kind, sources.map((s) => resolve(s)), resolve(destDir))
    }
  )

  ipcMain.handle('fileJob:cancel', () => {
    getFileJobs().cancel()
  })

  ipcMain.handle('fs:startFolderSize', (_e, dirPath: string) => {
    return getFolderSizeMgr().start(resolve(dirPath))
  })

  ipcMain.handle('fs:cancelFolderSize', (_e, requestId: string) => {
    getFolderSizeMgr().cancel(requestId)
  })

  ipcMain.handle('pty:spawn', (_e, paneId: string, cols: number, rows: number, cwd?: string, cmd?: string, args?: string[]) => {
    const packagedAllow = new Set(['gitui', 'lazygit'])
    let safeCmd = cmd
    let safeArgs = args
    if (app.isPackaged && cmd && !packagedAllow.has(cmd)) {
      safeCmd = undefined
      safeArgs = undefined
    }
    getTerminals().spawn(paneId, cols, rows, cwd, safeCmd, safeArgs)
  })

  ipcMain.handle('pty:write', (_e, paneId: string, data: string) => {
    getTerminals().write(paneId, data)
  })

  ipcMain.handle('pty:resize', (_e, paneId: string, cols: number, rows: number) => {
    getTerminals().resize(paneId, cols, rows)
  })

  ipcMain.handle('pty:dispose', (_e, paneId: string) => {
    getTerminals().dispose(paneId)
  })

  ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
    const { rename } = await import('node:fs/promises')
    await rename(resolve(oldPath), resolve(newPath))
  })
}
