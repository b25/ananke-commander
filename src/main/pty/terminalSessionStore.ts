import { app } from 'electron'
import Store from 'electron-store'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TerminalSessionMeta } from '../../shared/contracts.js'

interface HistoryData {
  sessions: TerminalSessionMeta[]
}

export class TerminalSessionStore {
  private store: Store<HistoryData>
  private sessionsDir: string

  constructor() {
    this.store = new Store<HistoryData>({
      name: 'ananke-terminal-history',
      defaults: { sessions: [] }
    })
    this.sessionsDir = join(app.getPath('userData'), 'terminal-sessions')
  }

  async save(meta: TerminalSessionMeta, text: string, maxSessions: number): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true })
    await writeFile(join(this.sessionsDir, `${meta.id}.txt`), text, 'utf8')
    const sessions = this.store.get('sessions', [])
    sessions.unshift(meta)
    const trimmed = sessions.slice(0, maxSessions)
    for (const old of sessions.slice(maxSessions)) {
      try { await unlink(join(this.sessionsDir, `${old.id}.txt`)) } catch { /* ignore */ }
    }
    this.store.set('sessions', trimmed)
  }

  list(): TerminalSessionMeta[] {
    return this.store.get('sessions', [])
  }

  async read(id: string): Promise<string | null> {
    try {
      return await readFile(join(this.sessionsDir, `${id}.txt`), 'utf8')
    } catch {
      return null
    }
  }

  async delete(id: string): Promise<void> {
    const sessions = this.store.get('sessions', [])
    this.store.set('sessions', sessions.filter(s => s.id !== id))
    try { await unlink(join(this.sessionsDir, `${id}.txt`)) } catch { /* ignore */ }
  }

  async clear(): Promise<void> {
    const sessions = this.store.get('sessions', [])
    for (const s of sessions) {
      try { await unlink(join(this.sessionsDir, `${s.id}.txt`)) } catch { /* ignore */ }
    }
    this.store.set('sessions', [])
  }
}
