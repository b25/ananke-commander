import archiver from 'archiver'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { finished } from 'node:stream/promises'
import yauzl from 'yauzl'
import { isSafeArchiveMemberPath, safeJoin } from './pathSafe.js'

async function addSources(archive: archiver.Archiver, sources: string[]): Promise<void> {
  const { stat } = await import('node:fs/promises')
  for (const src of sources) {
    const st = await stat(src)
    if (st.isDirectory()) archive.directory(src, basename(src))
    else archive.file(src, { name: basename(src) })
  }
}

export async function packZip(sources: string[], outFile: string): Promise<void> {
  await mkdir(dirname(outFile), { recursive: true })
  const output = createWriteStream(outFile)
  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.on('error', (err) => output.destroy(err))
  archive.pipe(output)
  await addSources(archive, sources)
  await archive.finalize()
  await finished(output)
}

export async function unpackZip(zipPath: string, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true })
  await new Promise<void>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) {
        reject(err ?? new Error('open zip'))
        return
      }
      zip.readEntry()
      zip.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) {
          zip.readEntry()
          return
        }
        if (!isSafeArchiveMemberPath(entry.fileName.replace(/\\/g, '/'))) {
          zip.readEntry()
          return
        }
        const dest = safeJoin(outDir, entry.fileName)
        if (!dest) {
          zip.readEntry()
          return
        }
        zip.openReadStream(entry, (e, readStream) => {
          if (e || !readStream) {
            reject(e ?? new Error('read'))
            return
          }
          void mkdir(dirname(dest), { recursive: true }).then(() => {
            const ws = createWriteStream(dest)
            readStream.pipe(ws)
            ws.on('close', () => zip.readEntry())
            ws.on('error', reject)
          })
        })
      })
      zip.on('end', () => resolve())
      zip.on('error', reject)
    })
  })
}
