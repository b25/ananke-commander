import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface VaultNote {
  filename: string
  modified: number
}

export async function saveMarkdownToVault(
  vaultPath: string,
  subfolder: string,
  filename: string,
  body: string
): Promise<string> {
  const dir = join(vaultPath, subfolder)
  await mkdir(dir, { recursive: true })
  const safeName = filename.endsWith('.md') ? filename : `${filename}.md`
  const full = join(dir, safeName)
  await writeFile(full, body, 'utf8')
  return full
}

export async function listVaultNotes(
  vaultPath: string,
  subfolder: string
): Promise<VaultNote[]> {
  const dir = join(vaultPath, subfolder)
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
    const full = join(vaultPath, subfolder, filename)
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
  const full = join(vaultPath, subfolder, filename)
  await unlink(full)
}
