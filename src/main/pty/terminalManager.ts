import type { BrowserWindow } from 'electron'
import pty from 'node-pty'
import { homedir } from 'node:os'

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe'
  return process.env.SHELL || '/bin/bash'
}

/** Ensure Homebrew paths are available — mutates process.env.PATH once at startup. */
function ensureBrewPaths(): void {
  if (process.platform === 'win32') return
  const current = process.env.PATH || '/usr/bin:/bin'
  const extra = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin']
  const parts = current.split(':')
  const missing = extra.filter(p => !parts.includes(p))
  if (missing.length) process.env.PATH = [...missing, ...parts].join(':')
}
ensureBrewPaths()

const MAX_SESSION_SIZE = 1024 * 1024 // 1 MB cap per session

function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')        // Private mode (e.g. ?2004h)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')           // CSI sequences (colors, cursor)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences (title)
    .replace(/\x1b[()][AB012]/g, '')                  // Character set selection
    .replace(/\x1b[>=<]/g, '')                        // Keypad modes
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '')
}

export interface SessionSnapshot {
  paneId: string
  cwd: string
  startedAt: number
  text: string
}

export class TerminalManager {
  private win: BrowserWindow
  private procs = new Map<string, pty.IPty>()
  private buffers = new Map<string, string[]>()
  private flushTimer: ReturnType<typeof setInterval> | null = null
  // Session accumulation for auto-save on app quit
  private sessionChunks = new Map<string, string[]>()
  private sessionSizes = new Map<string, number>()
  private sessionMeta = new Map<string, { cwd: string; startedAt: number }>()

  constructor(win: BrowserWindow) {
    this.win = win
  }

  private startFlushing(): void {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => this.flushAll(), 8)
  }

  private stopFlushing(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private flushAll(): void {
    for (const [paneId, chunks] of this.buffers) {
      if (chunks.length === 0) continue
      const data = chunks.join('')
      this.buffers.set(paneId, [])
      if (!this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
        this.win.webContents.send('pty:data', { paneId, data })
      }
    }
  }

  spawn(paneId: string, cols: number, rows: number, cwd?: string, cmd?: string, argsOverride?: string[]): void {
    this.dispose(paneId)
    const shell = cmd || defaultShell()
    const args = argsOverride || (process.platform !== 'win32' && !cmd ? ['--login'] : [])
    // Validate cwd: must be absolute path that exists, else fall back to home
    let safeCwd = homedir()
    if (cwd && cwd.startsWith('/')) {
      try { if (require('node:fs').statSync(cwd).isDirectory()) safeCwd = cwd } catch { /* use home */ }
    } else if (cwd && /^[A-Za-z]:/.test(cwd)) {
      try { if (require('node:fs').statSync(cwd).isDirectory()) safeCwd = cwd } catch { /* use home */ }
    }
    try {
      const proc = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: Math.max(1, cols || 80),
        rows: Math.max(1, rows || 24),
        cwd: safeCwd,
        env: process.env as Record<string, string>
      })
      this.procs.set(paneId, proc)
      this.buffers.set(paneId, [])
      this.sessionChunks.set(paneId, [])
      this.sessionSizes.set(paneId, 0)
      this.sessionMeta.set(paneId, { cwd: safeCwd, startedAt: Date.now() })
      this.startFlushing()
      proc.onData((data) => {
        const buf = this.buffers.get(paneId)
        if (buf) buf.push(data)
        // Accumulate for session history
        const sz = this.sessionSizes.get(paneId) || 0
        if (sz < MAX_SESSION_SIZE) {
          const chunks = this.sessionChunks.get(paneId)
          if (chunks) { chunks.push(data); this.sessionSizes.set(paneId, sz + data.length) }
        }
      })
      proc.onExit(({ exitCode }) => {
        this.procs.delete(paneId)
        if (!this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
          this.win.webContents.send('pty:exit', { paneId, exitCode })
        }
      })
    } catch (e) {
      if (!this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
        this.win.webContents.send('pty:data', { paneId, data: `\r\nError launching PTY: ${e instanceof Error ? e.message : String(e)}\r\n` })
        this.win.webContents.send('pty:exit', { paneId, exitCode: 1 })
      }
    }
  }

  write(paneId: string, data: string): void {
    this.procs.get(paneId)?.write(data)
  }

  resize(paneId: string, cols: number, rows: number): void {
    this.procs.get(paneId)?.resize(cols, rows)
  }

  dispose(paneId: string): void {
    const p = this.procs.get(paneId)
    if (p) {
      // Flush any buffered data before removing the session
      const pending = this.buffers.get(paneId)
      if (pending && pending.length > 0) {
        const data = pending.join('')
        if (!this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
          this.win.webContents.send('pty:data', { paneId, data })
        }
      }
      this.buffers.delete(paneId)

      // Send EOF to allow bash/zsh to flush .zsh_history gracefully
      try {
        p.write('\x04') // Ctrl+D
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try { p.kill() } catch { /* ignore */ }
      }, 300)
      this.procs.delete(paneId)
      // Clear session data — renderer already saved via handleClose
      this.sessionChunks.delete(paneId)
      this.sessionSizes.delete(paneId)
      this.sessionMeta.delete(paneId)
      if (this.procs.size === 0) this.stopFlushing()
    }
  }

  /** Drain all accumulated session data for saving on app quit. Clears internal state. */
  drainAllSessions(): SessionSnapshot[] {
    const results: SessionSnapshot[] = []
    for (const [paneId, chunks] of this.sessionChunks) {
      const meta = this.sessionMeta.get(paneId)
      if (!meta || chunks.length === 0) continue
      const raw = chunks.join('')
      const text = stripAnsi(raw).trimEnd()
      if (text) {
        results.push({ paneId, cwd: meta.cwd, startedAt: meta.startedAt, text })
      }
    }
    this.sessionChunks.clear()
    this.sessionSizes.clear()
    this.sessionMeta.clear()
    return results
  }

  disposeAll(): void {
    for (const id of [...this.procs.keys()]) {
      const p = this.procs.get(id)
      if (p) {
        // Flush pending IPC data
        const pending = this.buffers.get(id)
        if (pending && pending.length > 0) {
          const data = pending.join('')
          if (!this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
            this.win.webContents.send('pty:data', { paneId: id, data })
          }
        }
        this.buffers.delete(id)
        try { p.write('\x04') } catch { /* ignore */ }
        setTimeout(() => { try { p.kill() } catch { /* ignore */ } }, 300)
        this.procs.delete(id)
      }
    }
    this.stopFlushing()
  }
}
