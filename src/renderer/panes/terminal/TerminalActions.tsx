import { useEffect, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { TerminalSessionMeta } from '../../../shared/contracts'

function extractTerminalText(term: Terminal): string {
  const lines: string[] = []
  const buf = term.buffer.active
  for (let i = 0; i < buf.length; i++) {
    lines.push(buf.getLine(i)?.translateToString(true) ?? '')
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}

export { extractTerminalText }

function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Props {
  paneId: string
  termRef: React.RefObject<Terminal | null>
  cwd: string
  onViewSession: (session: TerminalSessionMeta) => void
}

export function TerminalActions({ paneId, termRef, cwd, onViewSession }: Props) {
  const [saving, setSaving] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [sessions, setSessions] = useState<TerminalSessionMeta[]>([])
  const histRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (histOpen) {
      void window.ananke.termHistory.list().then(setSessions)
      const onPointer = (e: PointerEvent) => {
        if (histRef.current && !histRef.current.contains(e.target as Node)) setHistOpen(false)
      }
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setHistOpen(false)
      }
      document.addEventListener('pointerdown', onPointer)
      window.addEventListener('keydown', onKey)
      return () => {
        document.removeEventListener('pointerdown', onPointer)
        window.removeEventListener('keydown', onKey)
      }
    }
  }, [histOpen])

  const saveToVault = async () => {
    const term = termRef.current
    if (!term || saving) return
    setSaving(true)
    try {
      const snap = await window.ananke.state.get()
      const { vaultPath, subfolder } = snap.settings.obsidian
      if (!vaultPath) { alert('Set Obsidian vault path in Settings first.'); return }
      const text = extractTerminalText(term)
      if (!text.trim()) { alert('Terminal is empty.'); return }
      const lineCount = text.split('\n').length
      const shortCwd = cwd.split('/').pop() || 'terminal'
      if (!confirm(`Save ${lineCount} lines from "${shortCwd}" to Obsidian vault?`)) return
      const date = new Date().toISOString()
      const wsIdx = snap.workspaces.findIndex(w => w.id === snap.activeWorkspaceId)
      const wsName = snap.workspaces[wsIdx]?.name || 'Workspace'
      const wsLabel = `${wsIdx + 1}-${wsName}`
      const safeTitle = `terminal-${wsLabel}-${shortCwd}-${date.slice(0, 10)}-${date.slice(11, 16).replace(':', '')}`
        .replace(/[/\\:*?"<>|]/g, '-')
      const body = [
        '---',
        `title: "Terminal: ${shortCwd}"`,
        `workspace: "${wsLabel}"`,
        `cwd: ${cwd}`,
        `date: ${date}`,
        `tags: [terminal-capture]`,
        '---',
        '',
        '```',
        text,
        '```'
      ].join('\n')
      await window.ananke.notes.saveVault(vaultPath, subfolder, safeTitle, body)
    } finally {
      setSaving(false)
    }
  }

  const deleteSession = async (id: string) => {
    await window.ananke.termHistory.delete(id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="pane-header__actions" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <button
        type="button"
        className="btn-thin"
        title="Save terminal output to Obsidian Vault"
        onClick={() => void saveToVault()}
        disabled={saving}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
        </svg>
      </button>

      <div className="layout-picker" ref={histRef}>
        <button
          type="button"
          className={`btn-thin${histOpen ? ' open' : ''}`}
          title="Terminal session history"
          onClick={() => setHistOpen(!histOpen)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
        {histOpen && (
          <div className="layout-picker__popover term-history-popover" role="menu" style={{ minWidth: 280, maxHeight: 320, overflowY: 'auto' }}>
            <div className="browser-menu__section-label">Session History</div>
            {sessions.length === 0 && (
              <div style={{ padding: '8px 10px', color: 'var(--muted)', fontSize: 10 }}>No saved sessions</div>
            )}
            {sessions.map(s => (
              <div key={s.id} className="term-history__item">
                <button
                  type="button"
                  className="term-history__main"
                  onClick={() => { onViewSession(s); setHistOpen(false) }}
                >
                  <span className="term-history__title">{s.title || s.cwd}</span>
                  <span className="term-history__meta">
                    {formatDate(s.endedAt)} &middot; {s.lineCount} lines
                  </span>
                </button>
                <button
                  type="button"
                  className="term-history__delete"
                  title="Delete session"
                  onClick={() => void deleteSession(s.id)}
                >
                  &times;
                </button>
              </div>
            ))}
            {sessions.length > 0 && (
              <>
                <div className="layout-picker__divider" />
                <button
                  type="button"
                  className="browser-menu__item"
                  style={{ color: 'var(--danger)' }}
                  onClick={async () => {
                    await window.ananke.termHistory.clear()
                    setSessions([])
                  }}
                >
                  Clear All History
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
