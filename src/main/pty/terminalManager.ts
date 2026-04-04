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
    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || homedir(),
      env: process.env as Record<string, string>
    })
    this.procs.set(paneId, proc)
    proc.onData((data) => {
      this.win.webContents.send('pty:data', { paneId, data })
    })
    proc.onExit(({ exitCode }) => {
      this.procs.delete(paneId)
      this.win.webContents.send('pty:exit', { paneId, exitCode })
    })
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
      p.kill()
      this.procs.delete(paneId)
    }
  }

  disposeAll(): void {
    for (const id of [...this.procs.keys()]) this.dispose(id)
  }
}
