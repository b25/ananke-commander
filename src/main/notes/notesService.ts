import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

export interface VaultNote {
  filename: string
  modified: number
}

function resolveWithinVault(vaultPath: string, ...parts: string[]): string {
  const root = resolve(vaultPath)
  const resolved = resolve(root, ...parts)
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error('Path escapes vault root')
  }
  return resolved
}

export async function saveMarkdownToVault(
  vaultPath: string,
  subfolder: string,
  filename: string,
  body: string
): Promise<string> {
  const dir = resolveWithinVault(vaultPath, subfolder)
  await mkdir(dir, { recursive: true })
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`
  const full = resolveWithinVault(vaultPath, subfolder, safeName)
  await writeFile(full, body, 'utf8')
  return full
}

export async function listVaultNotes(
  vaultPath: string,
  subfolder: string
): Promise<VaultNote[]> {
  const dir = resolveWithinVault(vaultPath, subfolder)
  try {
    await mkdir(dir, { recursive: true })
    const entries = await readdir(dir)
    const notes: VaultNote[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      try {
        const s = await stat(join(dir, entry))
        notes.push({ filename: entry, modified: s.mtimeMs })
      } catch { /* skip unreadable */ }
    }
    notes.sort((a, b) => b.modified - a.modified)
    return notes
  } catch {
    return []
  }
}

export async function readVaultNote(
  vaultPath: string,
  subfolder: string,
  filename: string
): Promise<string | null> {
  try {
    const full = resolveWithinVault(vaultPath, subfolder, filename)
    return await readFile(full, 'utf8')
  } catch {
    return null
  }
}

export async function deleteVaultNote(
  vaultPath: string,
  subfolder: string,
  filename: string
): Promise<void> {
  const { unlink } = await import('node:fs/promises')
  const full = resolveWithinVault(vaultPath, subfolder, filename)
  await unlink(full)
}
