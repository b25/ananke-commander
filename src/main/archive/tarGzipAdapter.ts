import archiver from 'archiver'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { finished } from 'node:stream/promises'
import { x as tarExtract } from 'tar'
import { isSafeArchiveMemberPath } from './pathSafe.js'

async function addSources(archive: archiver.Archiver, sources: string[]): Promise<void> {
  const { stat } = await import('node:fs/promises')
  for (const src of sources) {
    const st = await stat(src)
    if (st.isDirectory()) archive.directory(src, basename(src))
    else archive.file(src, { name: basename(src) })
  }
}

export async function packTarGzip(sources: string[], outFile: string): Promise<void> {
  await mkdir(dirname(outFile), { recursive: true })
  const output = createWriteStream(outFile)
  const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } })
  archive.on('error', (err) => output.destroy(err))
  archive.pipe(output)
  await addSources(archive, sources)
  await archive.finalize()
  await finished(output)
}

export async function unpackTarGzip(tgzPath: string, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true })
  await tarExtract({
    file: tgzPath,
    cwd: outDir,
    filter: (path, entry) => {
      const raw =
        entry && typeof entry === 'object' && 'path' in entry && typeof (entry as { path: unknown }).path === 'string'
          ? (entry as { path: string }).path
          : path
      return isSafeArchiveMemberPath(String(raw).replace(/\\/g, '/'))
    }
  })
}
