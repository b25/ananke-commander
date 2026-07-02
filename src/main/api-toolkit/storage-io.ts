/**
 * Pure filesystem I/O helpers for api-toolkit storage.
 * No Electron dependency — importable in Node.js test contexts.
 *
 * writeJson: atomic write via <file>.tmp → renameSync (mirrors tomlConfig.ts:250-260).
 * readJson:  on parse failure, backs up the corrupt file to <file>.corrupt-<ts>
 *            so data is recoverable, then returns the fallback.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export function readJson<T>(path: string, fallback: T): T {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    // ENOENT is normal on first launch; any other read error is worth logging.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[api-toolkit/storage] Failed to read ${path}:`, err)
    }
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    // File exists but is corrupt — back it up before returning the fallback
    // so the user's data is recoverable and isn't silently discarded.
    const backupPath = `${path}.corrupt-${Date.now()}`
    try {
      renameSync(path, backupPath)
      console.error(
        `[api-toolkit/storage] Corrupt JSON at ${path} backed up to ${backupPath}:`,
        err
      )
    } catch (renameErr) {
      console.error(
        `[api-toolkit/storage] Corrupt JSON at ${path} (backup failed):`,
        err,
        renameErr
      )
    }
    return fallback
  }
}

export function writeJson(path: string, data: unknown): void {
  // Ensure the parent directory exists (callers may pass a path in a fresh dir).
  const parent = dirname(path)
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
  // Atomic write: write to .tmp then rename so a crash never leaves the
  // destination in a partially-written / truncated state.
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, path)
}
