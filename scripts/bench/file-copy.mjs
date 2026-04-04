import { mkdir, mkdtemp, rm, writeFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

const root = await mkdtemp(join(tmpdir(), 'tc-copy-'))
const src = join(root, 'src')
const dst = join(root, 'dst')
await mkdir(src, { recursive: true })
const n = 2000
for (let i = 0; i < n; i += 1) {
  await writeFile(join(src, `f-${i}.txt`), 'x'.repeat(256), 'utf8')
}
const t0 = performance.now()
await cp(src, dst, { recursive: true })
const ms = performance.now() - t0
console.log(`Copied ${n} small files in ${ms.toFixed(0)} ms`)
await rm(root, { recursive: true, force: true })
