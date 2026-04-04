import type { BrowserWindow } from 'electron'
import pty from 'node-pty'
import { homedir } from 'node:os'

function defaultShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe'
  return process.env.SHELL || '/bin/bash'
}

export class TerminalManager {
  private win: BrowserWindow
  private procs = new Map<string, pty.IPty>()

  constructor(win: BrowserWindow) {
    this.win = win
  }

  spawn(paneId: string, cols: number, rows: number, cwd?: string): void {
    this.dispose(paneId)
    const shell = defaultShell()
    const args = process.platform !== 'win32' ? ['--login'] : []
    try {
      const proc = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: Math.max(1, cols || 80),
        rows: Math.max(1, rows || 24),
        cwd: cwd || homedir(),
        env: process.env as Record<string, string>
      })
      this.procs.set(paneId, proc)
      proc.onData((data) => {
        if (!this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
          this.win.webContents.send('pty:data', { paneId, data })
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
    }
  }

  disposeAll(): void {
    for (const id of [...this.procs.keys()]) this.dispose(id)
  }
}
