#!/usr/bin/env node
/**
 * Rough PTY throughput check (Node + node-pty, not Electron).
 * Run: node scripts/bench/pty-throughput.mjs
 */
import { performance } from 'node:perf_hooks'
import * as pty from 'node-pty'

const cols = 120
const rows = 40
const chunkSize = 8192
const chunks = 400

let received = 0
const child = pty.spawn('cat', [], { name: 'xterm-256color', cols, rows, cwd: process.cwd() })

child.onData((data) => {
  received += data.length
})

await new Promise((r) => setTimeout(r, 50))

const payload = 'P'.repeat(chunkSize)
const t0 = performance.now()
for (let i = 0; i < chunks; i++) {
  child.write(payload)
}
await new Promise((r) => setTimeout(r, 600))
const ms = performance.now() - t0
const wrote = chunkSize * chunks
const mb = wrote / (1024 * 1024)
console.log(`Wrote ${mb.toFixed(2)} MiB to PTY (cat echo) in ${ms.toFixed(0)} ms`)
console.log(`Read back ~${(received / (1024 * 1024)).toFixed(2)} MiB from PTY`)
child.kill()
