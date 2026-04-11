import { useEffect, useRef, useState } from 'react'
import type { NotesPaneState } from '../../../shared/contracts'
import { PaneHeader } from '../../layout/PaneHeader'

type VaultNote = { filename: string; modified: number }

type Props = {
  pane: NotesPaneState
  isActive: boolean
  notesUndoMax: number
  onUpdate: (next: NotesPaneState) => void
  onClose: () => void
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return time
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export function NotesPane({ pane, isActive, notesUndoMax, onUpdate, onClose }: Props) {
  const undoStack = useRef<string[]>([])
  const [localBody, setLocalBody] = useState(pane.body)
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [view, setView] = useState<'editor' | 'list'>(pane.currentFile ? 'editor' : 'list')
  const [notesList, setNotesList] = useState<VaultNote[]>([])
  const [listFilter, setListFilter] = useState('')
  const [vaultPath, setVaultPath] = useState('')
  const [wsName, setWsName] = useState('')

  useEffect(() => { setLocalBody(pane.body) }, [pane.id])

  // Load vault path and workspace name
  useEffect(() => {
    void window.ananke.state.get().then(snap => {
      setVaultPath(snap.settings.obsidian.vaultPath)
      const ws = snap.workspaces.find(w => w.id === snap.activeWorkspaceId)
      setWsName(ws?.name ?? 'default')
    })
  }, [pane.id])

  // Load notes list when switching to list view or on mount
  const refreshList = async () => {
    if (!vaultPath) return
    const subfolder = wsName.replace(/[/\\:*?"<>|]/g, '-') || 'default'
    const notes = await window.ananke.notes.listVault(vaultPath, subfolder)
    setNotesList(notes)
  }

  useEffect(() => {
    if (view === 'list' && vaultPath) void refreshList()
  }, [view, vaultPath, wsName])

  // Auto-load last file on mount
  useEffect(() => {
    if (pane.currentFile && vaultPath && wsName) {
      void loadNote(pane.currentFile)
    }
  }, [vaultPath, wsName])

  const subfolder = () => wsName.replace(/[/\\:*?"<>|]/g, '-') || 'default'

  const loadNote = async (filename: string) => {
    if (!vaultPath) return
    const content = await window.ananke.notes.readVault(vaultPath, subfolder(), filename)
    if (content === null) return
    // Parse title from frontmatter or filename
    let title = filename.replace(/\.md$/, '')
    let body = content
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    if (fmMatch) {
      const titleMatch = fmMatch[1].match(/title:\s*"?(.+?)"?\s*$/m)
      if (titleMatch) title = titleMatch[1]
      body = fmMatch[2].trimStart()
    }
    setLocalBody(body)
    undoStack.current = []
    onUpdate({ ...pane, title, body, currentFile: filename })
    setView('editor')
  }

  const saveNote = async () => {
    if (!vaultPath) {
      alert('Set Obsidian vault path in Settings first.')
      return
    }
    const title = pane.title || 'Untitled'
    const safeTitle = title.replace(/[/\\:*?"<>|]/g, '-')
    const filename = pane.currentFile || `${safeTitle}.md`
    const date = new Date().toISOString()
    const body = `---\ntitle: "${title}"\ndate: ${date}\ntags: [notes]\n---\n\n${localBody}`
    await window.ananke.notes.saveVault(vaultPath, subfolder(), filename.endsWith('.md') ? filename.replace(/\.md$/, '') : filename, body)
    onUpdate({ ...pane, currentFile: filename.endsWith('.md') ? filename : `${filename}.md` })
  }

  const newNote = () => {
    const title = 'New Note'
    setLocalBody('')
    undoStack.current = []
    onUpdate({ ...pane, title, body: '', currentFile: undefined })
    setView('editor')
  }

  const deleteNote = async (filename: string) => {
    if (!vaultPath) return
    await window.ananke.notes.deleteVault(vaultPath, subfolder(), filename)
    if (pane.currentFile === filename) {
      onUpdate({ ...pane, title: 'Notes', body: '', currentFile: undefined })
      setLocalBody('')
    }
    void refreshList()
  }

  const wordCount = localBody.trim() === '' ? 0 : localBody.trim().split(/\s+/).length

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setLocalBody(val)
    undoStack.current.push(pane.body)
    if (undoStack.current.length > Math.max(1, notesUndoMax)) undoStack.current.shift()
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current)
    updateTimerRef.current = setTimeout(() => {
      void onUpdate({ ...pane, body: val })
    }, 400)
  }

  useEffect(() => {
    return () => { if (updateTimerRef.current) clearTimeout(updateTimerRef.current) }
  }, [])

  const filtered = listFilter.trim()
    ? notesList.filter(n => n.filename.toLowerCase().includes(listFilter.toLowerCase()))
    : notesList

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={pane.title} paneType="notes" onClose={onClose} />
      <div className="pane-body notes-pane-body">
        <div className="notes-toolbar">
          <button type="button" className="notes-toolbar__btn" title="Notes list" onClick={() => { setView('list'); void refreshList() }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
          <button type="button" className="notes-toolbar__btn" title="New note" onClick={newNote}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <div className="notes-toolbar__spacer" />
          {view === 'editor' && (
            <>
              <button type="button" className="notes-toolbar__btn" title="Save to vault" onClick={() => void saveNote()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              </button>
              <button type="button" className="notes-toolbar__btn" title="Copy to clipboard" onClick={() => void window.ananke.clipboard.writeText(localBody)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
              <button type="button" className="notes-toolbar__btn" title="Export as file" onClick={async () => {
                const p = await window.ananke.dialog.saveFile(`${pane.title || 'note'}.md`)
                if (p) await window.ananke.fs.writeUtf8(p, localBody)
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
            </>
          )}
        </div>

        {view === 'list' ? (
          <div className="notes-list">
            <div className="notes-list__header">
              <input
                className="notes-list__search"
                placeholder="Filter notes..."
                value={listFilter}
                onChange={e => setListFilter(e.target.value)}
              />
            </div>
            {!vaultPath && (
              <div className="notes-list__empty">Set Obsidian vault path in Settings to use notes.</div>
            )}
            {vaultPath && filtered.length === 0 && (
              <div className="notes-list__empty">{listFilter ? 'No matches' : 'No notes yet. Click + to create one.'}</div>
            )}
            <div className="notes-list__items">
              {filtered.map(note => (
                <div key={note.filename} className={`notes-list__item ${pane.currentFile === note.filename ? 'active' : ''}`}>
                  <button type="button" className="notes-list__item-btn" onClick={() => void loadNote(note.filename)}>
                    <span className="notes-list__item-name">{note.filename.replace(/\.md$/, '')}</span>
                    <span className="notes-list__item-date">{formatDate(note.modified)}</span>
                  </button>
                  <button type="button" className="notes-toolbar__btn notes-list__delete-btn" title="Delete note" onClick={() => { if (confirm(`Delete "${note.filename}"?`)) void deleteNote(note.filename) }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="notes-editor">
            <input
              value={pane.title}
              onChange={(e) => onUpdate({ ...pane, title: e.target.value })}
              placeholder="Title"
            />
            <textarea
              value={localBody}
              onChange={handleBodyChange}
              placeholder="Markdown notes..."
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                  e.preventDefault()
                  if (undoStack.current.length > 0) {
                    const prev = undoStack.current.pop()!
                    void onUpdate({ ...pane, body: prev })
                  }
                }
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault()
                  void saveNote()
                }
              }}
            />
            <div className="notes-status-bar">
              {pane.currentFile && <span className="notes-status-bar__file">{pane.currentFile}</span>}
              {wordCount} words · {localBody.length} chars
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
