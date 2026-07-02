import { renameSync } from 'node:fs'

/**
 * Renames a corrupt store file to `<path>.corrupt-<Date.now()>` so that the
 * next Store construction can start fresh from defaults instead of throwing.
 * The rename is best-effort: any failure (missing file, permission error, etc.)
 * is silently swallowed — startup must always continue regardless.
 */
export function backupCorruptFile(filePath: string): void {
  try {
    renameSync(filePath, `${filePath}.corrupt-${Date.now()}`)
  } catch { /* best-effort — ignore rename failures */ }
}
