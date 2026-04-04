import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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
