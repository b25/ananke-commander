import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileBrowserPaneState, ListDirEntry, PaneState } from '../../../shared/contracts'
import { joinPath } from '../../lib/pathUtils'
import { FileList } from './FileList'
import { PaneHeader } from '../../layout/PaneHeader'
import { ArchiveDialog } from './ArchiveDialog'

type Props = {
  pane: FileBrowserPaneState
  isActive: boolean
  allPanes: PaneState[]
  onUpdate: (next: FileBrowserPaneState) => void
  onClose: () => void
}

export function FileBrowserPane({ pane, isActive, allPanes, onUpdate, onClose }: Props) {
  const [leftEntries, setLeftEntries] = useState<ListDirEntry[]>([])
  const [rightEntries, setRightEntries] = useState<ListDirEntry[]>([])
  const [copyOpen, setCopyOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [destPaneId, setDestPaneId] = useState<string>('')
  const [fileJobLine, setFileJobLine] = useState<string | null>(null)
  const [editorState, setEditorState] = useState<{ path: string; text: string; readOnly: boolean } | null>(null)
  const activeJobId = useRef<string | null>(null)

  const openEditor = async (readOnly: boolean) => {
    // Determine active path/selection dynamically
    const paths = pane.focusedSide === 'left' ? pane.leftSelection : pane.rightSelection
    if (!paths.length) return
    const p = paths[0]
    setFileJobLine(readOnly ? 'Reading...' : 'Loading for edit...')
    try {
      const text = await window.ananke.fs.readUtf8(p)
      setEditorState({ path: p, text, readOnly })
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setFileJobLine(null)
    }
  }

  const saveEditor = async (newText: string) => {
    if (!editorState) return
    setFileJobLine('Saving...')
    try {
      await window.ananke.fs.writeUtf8(editorState.path, newText)
      setEditorState(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setFileJobLine(null)
    }
  }

  const leftSel = new Set(pane.leftSelection)
  const rightSel = new Set(pane.rightSelection)

  const refreshDir = useCallback(async (dir: string) => {
    return window.ananke.fs.listDir(dir)
  }, [])

  useEffect(() => {
    void refreshDir(pane.leftPath).then(setLeftEntries)
  }, [pane.leftPath, refreshDir])

  useEffect(() => {
    void refreshDir(pane.rightPath).then(setRightEntries)
  }, [pane.rightPath, refreshDir])

  const fileBrowserDests = allPanes.filter(
    (p): p is FileBrowserPaneState => p.type === 'file-browser' && p.id !== pane.id
  )

  const selectedPaths =
    pane.focusedSide === 'left' ? [...pane.leftSelection] : [...pane.rightSelection]

  const activePath = pane.focusedSide === 'left' ? pane.leftPath : pane.rightPath

  const refreshBoth = useCallback(() => {
    void refreshDir(pane.leftPath).then(setLeftEntries)
    void refreshDir(pane.rightPath).then(setRightEntries)
  }, [pane.leftPath, pane.rightPath, refreshDir])

  const refreshBothRef = useRef(refreshBoth)
  refreshBothRef.current = refreshBoth

  const activateEntry = useCallback(
    async (side: 'left' | 'right', entry: ListDirEntry) => {
      if (entry.isDirectory) {
        if (side === 'left') {
          onUpdate({ ...pane, focusedSide: 'left', leftPath: entry.path, leftSelection: [pane.leftPath] })
        } else {
          onUpdate({ ...pane, focusedSide: 'right', rightPath: entry.path, rightSelection: [pane.rightPath] })
        }
        return
      }
      const err = await window.ananke.shell.openPath(entry.path)
      if (err) alert(err)
    },
    [onUpdate, pane]
  )

  const doDelete = useCallback(async () => {
    if (!selectedPaths.length) return
    await window.ananke.fs.quickOp('delete', '', selectedPaths)
    refreshBoth()
    onUpdate({ ...pane, leftSelection: [], rightSelection: [] })
  }, [pane, onUpdate, refreshBoth, selectedPaths])

  const [layout, setLayout] = useState<'split' | 'single'>('split')

  useEffect(() => {
    if (!copyOpen && !moveOpen && !archiveOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setCopyOpen(false)
        setMoveOpen(false)
        setArchiveOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copyOpen, moveOpen, archiveOpen])

  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent) => {
      // Editor intercept
      if (editorState) {
        if (e.key === 'Escape') setEditorState(null)
        // If F4 inside editor, safe to save? Maybe too complex. Just handle Escape.
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        if (layout === 'split') {
          const nextSide = pane.focusedSide === 'left' ? 'right' : 'left'
          const targetEntries = nextSide === 'left' ? leftEntries : rightEntries
          const currentSelection = nextSide === 'left' ? pane.leftSelection : pane.rightSelection
          
          if (currentSelection.length > 0) {
            onUpdate({ ...pane, focusedSide: nextSide })
          } else {
            const firstPath = targetEntries.length > 0 ? targetEntries[0].path : (nextSide === 'left' ? pane.leftPath : pane.rightPath)
            onUpdate({ 
              ...pane, 
              focusedSide: nextSide,
              [nextSide === 'left' ? 'leftSelection' : 'rightSelection']: [firstPath]
            })
          }
        }
      }
      
      if (e.key === 'ArrowLeft' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (layout === 'split') {
          const rp = pane.rightSelection.length ? pane.rightSelection[0] : pane.rightPath
          const entry = rightEntries.find(x => x.path === rp)
          const target = (entry && entry.isDirectory) ? entry.path : pane.rightPath
          onUpdate({ ...pane, leftPath: target, leftSelection: [target] })
        }
      }

      if (e.key === 'ArrowRight' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (layout === 'split') {
          const lp = pane.leftSelection.length ? pane.leftSelection[0] : pane.leftPath
          const entry = leftEntries.find(x => x.path === lp)
          const target = (entry && entry.isDirectory) ? entry.path : pane.leftPath
          onUpdate({ ...pane, rightPath: target, rightSelection: [target] })
        }
      }

      if (e.key === 'F2') {
        e.preventDefault()
        if (!selectedPaths.length) return
        const src = selectedPaths[0]
        const oldName = src.match(/[^/\\]+$/)?.[0] || ''
        const newName = prompt(`Rename ${oldName} to:`, oldName)
        if (newName && newName !== oldName) {
           void window.ananke.fs.quickOp('rename', src, undefined, newName).then(refreshBoth)
        }
      }
      if (e.key === 'F3') {
        e.preventDefault()
        void openEditor(true)
      }
      if (e.key === 'F4') {
        e.preventDefault()
        void openEditor(false)
      }
      if (e.key === 'F5') {
        e.preventDefault()
        setDestPaneId(layout === 'split' ? '__internal__' : '')
        setCopyOpen(true)
      }
      if (e.key === 'F6') {
        e.preventDefault()
        setDestPaneId(layout === 'split' ? '__internal__' : '')
        setMoveOpen(true)
      }
      if (e.key === 'F7') {
        e.preventDefault()
        const folderName = prompt('New directory name:', 'NewFolder')
        if (folderName) {
           const outPath = joinPath(activePath, folderName)
           void window.ananke.fs.quickOp('mkdir', outPath).then(refreshBoth)
        }
      }
      if (e.key === 'F8') {
        e.preventDefault()
        if (!selectedPaths.length) return
        if (!confirm(`Delete ${selectedPaths.length} item(s)?`)) return
        void doDelete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, selectedPaths, doDelete, editorState, layout, pane, leftEntries, rightEntries])

  useEffect(() => {
    const offP = window.ananke.fileJob.onProgress((msg) => {
      if (msg.jobId !== activeJobId.current) return
      const cur = typeof msg.current === 'string' ? msg.current : ''
      const done = typeof msg.done === 'number' ? msg.done : 0
      const total = typeof msg.total === 'number' ? msg.total : 0
      setFileJobLine(total ? `${done}/${total} ${cur}` : cur || 'Working…')
    })
    const offD = window.ananke.fileJob.onDone(({ jobId: id }) => {
      if (id !== activeJobId.current) return
      activeJobId.current = null
      setFileJobLine(null)
      void refreshBothRef.current()
    })
    const offE = window.ananke.fileJob.onError(({ jobId: id, message }) => {
      if (id !== activeJobId.current) return
      activeJobId.current = null
      setFileJobLine(null)
      if (message !== 'Cancelled') alert(message)
      void refreshBothRef.current()
    })
    return () => {
      offP()
      offD()
      offE()
    }
  }, [])
  useEffect(() => {
    if (!isActive) return
    const onGlobalAction = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail === 'F3') void openEditor(true)
      if (detail === 'F4') void openEditor(false)
      if (detail === 'F5') setCopyOpen(true)
      if (detail === 'F6') setMoveOpen(true)
      if (detail === 'F8') {
        if (!selectedPaths.length) return
        if (!confirm(`Delete ${selectedPaths.length} item(s)?`)) return
        void doDelete()
      }
      if (detail === 'Arc') setArchiveOpen(true)
    }
    window.addEventListener('global-action', onGlobalAction)
    return () => window.removeEventListener('global-action', onGlobalAction)
  }, [isActive, selectedPaths, doDelete])

  const runCopyOrMove = async (kind: 'copy' | 'move') => {
    let destDir = ''
    if (destPaneId === '__internal__') {
      destDir = pane.focusedSide === 'left' ? pane.rightPath : pane.leftPath
    } else {
      const destPane = fileBrowserDests.find((p) => p.id === destPaneId)
      if (destPane) destDir = destPane.focusedSide === 'left' ? destPane.leftPath : destPane.rightPath
    }
    if (!destDir || !selectedPaths.length) return
    setCopyOpen(false)
    setMoveOpen(false)
    setFileJobLine(kind === 'copy' ? 'Copy…' : 'Move…')
    try {
      const jobId = await window.ananke.fileJob.start(kind, selectedPaths, destDir)
      activeJobId.current = jobId
      setFileJobLine(`${kind}…`)
    } catch (e) {
      activeJobId.current = null
      setFileJobLine(null)
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const suggestedArchive = joinPath(activePath, 'archive.zip')

  const [splitRatio, setSplitRatio] = useState(0.5)

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader 
        title={pane.title} 
        onClose={onClose} 
        actions={
          <button 
            type="button" 
            onClick={() => setLayout(layout === 'split' ? 'single' : 'split')}
            style={{ padding: '2px 8px', fontSize: '11px', marginRight: '8px' }}
          >
            {layout === 'split' ? 'Show Single Panel' : 'Show Split Panels'}
          </button>
        } 
      />
      <div className="pane-body">
        <div className="file-browser">
          {fileJobLine && (
            <div className="file-job-status">
              <span className="file-job-status-text">{fileJobLine}</span>
              <button
                type="button"
                className="file-job-cancel"
                onClick={() => void window.ananke.fileJob.cancel()}
              >
                Cancel
              </button>
            </div>
          )}
          <div className="file-browser-main">
            <div className="lists">
              {(layout === 'split' || pane.focusedSide === 'left') && (
                <div style={{ flex: layout === 'split' ? splitRatio : 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <FileList
                    path={pane.leftPath}
                    entries={leftEntries}
                    selected={leftSel}
                    focused={pane.focusedSide === 'left'}
                    isActive={isActive}
                    onPathChange={(p) => onUpdate({ ...pane, leftPath: p, leftSelection: [pane.leftPath] })}
                    onSelect={(paths, add) => {
                      const next = add ? new Set([...pane.leftSelection, ...paths]) : new Set(paths)
                      onUpdate({
                        ...pane,
                        focusedSide: 'left',
                        leftSelection: [...next]
                      })
                    }}
                    onActivate={(entry) => void activateEntry('left', entry)}
                  />
                </div>
              )}
              {layout === 'split' && (
                <div
                  className="pane-stack__gutter"
                  role="separator"
                  aria-orientation="vertical"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const startX = e.clientX
                    const startR = splitRatio
                    const row = e.currentTarget.parentElement!
                    const startW = row.getBoundingClientRect().width
                    const onMove = (ev: MouseEvent) => {
                      const dx = ev.clientX - startX
                      const delta = startW > 0 ? dx / startW : 0
                      setSplitRatio(Math.min(0.88, Math.max(0.12, startR + delta)))
                    }
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove)
                      window.removeEventListener('mouseup', onUp)
                    }
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                  }}
                />
              )}
              {(layout === 'split' || pane.focusedSide === 'right') && (
                <div style={{ flex: layout === 'split' ? 1 - splitRatio : 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <FileList
                    path={pane.rightPath}
                    entries={rightEntries}
                    selected={rightSel}
                    focused={pane.focusedSide === 'right'}
                    isActive={isActive}
                    onPathChange={(p) => onUpdate({ ...pane, rightPath: p, rightSelection: [pane.rightPath] })}
                    onSelect={(paths, add) => {
                      const next = add ? new Set([...pane.rightSelection, ...paths]) : new Set(paths)
                      onUpdate({
                        ...pane,
                        focusedSide: 'right',
                        rightSelection: [...next]
                      })
                    }}
                    onActivate={(entry) => void activateEntry('right', entry)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {(copyOpen || moveOpen) && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setCopyOpen(false); setMoveOpen(false) }}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{copyOpen ? 'Copy (F5)' : 'Move (F6)'}</h2>
            <p className="muted">Source: {activePath}</p>
            <p className="muted">Selected: {selectedPaths.length} items</p>
            <label className="muted">Destination file browser pane</label>
            <select
              value={destPaneId}
              onChange={(e) => setDestPaneId(e.target.value)}
              style={{ width: '100%', marginBottom: 12 }}
            >
              <option value="">— choose destination —</option>
              {layout === 'split' && (
                <option value="__internal__">This Pane: {pane.focusedSide === 'left' ? pane.rightPath : pane.leftPath}</option>
              )}
              {fileBrowserDests.map((p) => (
                <option key={p.id} value={p.id}>
                  Other Pane: {p.title} → {p.focusedSide === 'left' ? p.leftPath : p.rightPath}
                </option>
              ))}
            </select>
            {!fileBrowserDests.length && layout === 'single' && (
              <p className="muted">Add another file browser pane in this workspace or switch to Split layout.</p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setCopyOpen(false); setMoveOpen(false) }}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={!destPaneId || !selectedPaths.length}
                onClick={() => void runCopyOrMove(copyOpen ? 'copy' : 'move')}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveOpen && (
        <ArchiveDialog
          suggestedPackPath={suggestedArchive}
          onClose={() => setArchiveOpen(false)}
          onPack={async (format, outFile) => {
            const sources = selectedPaths.length ? selectedPaths : [activePath]
            await window.ananke.archive.pack(format, sources, outFile)
            refreshBoth()
          }}
          onUnpack={async (format, archivePath, outDir) => {
            await window.ananke.archive.unpack(format, archivePath, outDir)
            refreshBoth()
          }}
        />
      )}

      {editorState && (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditorState(null)}>
          <div className="modal" style={{ width: '80%', height: '80%', maxWidth: 'none', display: 'flex', flexDirection: 'column' }} role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '14px', margin: 0, paddingBottom: '8px' }}>
              {editorState.readOnly ? `Viewing: ${editorState.path}` : `Editing: ${editorState.path}`}
            </h2>
            <textarea
              defaultValue={editorState.text}
              readOnly={editorState.readOnly}
              id="file-editor-textarea"
              spellCheck={false}
              style={{
                flex: 1, marginTop: 8, marginBottom: 16, width: '100%',
                resize: 'none', fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace', 
                fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre', tabSize: 4,
                padding: 16, background: '#0d1117', color: '#e6edf3',
                border: '1px solid var(--border)', borderRadius: '6px', outline: 'none',
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)', overflow: 'auto'
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button type="button" onClick={() => setEditorState(null)}>Cancel</button>
              {!editorState.readOnly && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    const el = document.getElementById('file-editor-textarea') as HTMLTextAreaElement
                    void saveEditor(el.value)
                  }}
                >
                  Save File (F4)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
