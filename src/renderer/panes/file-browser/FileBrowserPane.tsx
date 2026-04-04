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
  const activeJobId = useRef<string | null>(null)

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
          onUpdate({ ...pane, focusedSide: 'left', leftPath: entry.path })
        } else {
          onUpdate({ ...pane, focusedSide: 'right', rightPath: entry.path })
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
      if (e.key === 'F5') {
        e.preventDefault()
        setCopyOpen(true)
      }
      if (e.key === 'F6') {
        e.preventDefault()
        setMoveOpen(true)
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
  }, [isActive, selectedPaths, doDelete])

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

  const runCopyOrMove = async (kind: 'copy' | 'move') => {
    const destPane = fileBrowserDests.find((p) => p.id === destPaneId)
    if (!destPane || !selectedPaths.length) return
    const destDir = destPane.focusedSide === 'left' ? destPane.leftPath : destPane.rightPath
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

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader title={pane.title} onClose={onClose} />
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
            <FileList
              path={pane.leftPath}
              entries={leftEntries}
              selected={leftSel}
              focused={pane.focusedSide === 'left'}
              onPathChange={(p) => onUpdate({ ...pane, leftPath: p })}
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
            <FileList
              path={pane.rightPath}
              entries={rightEntries}
              selected={rightSel}
              focused={pane.focusedSide === 'right'}
              onPathChange={(p) => onUpdate({ ...pane, rightPath: p })}
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
          <div className="file-ops">
            <button type="button" title="Copy F5" onClick={() => setCopyOpen(true)}>
              F5
            </button>
            <button type="button" title="Move F6" onClick={() => setMoveOpen(true)}>
              F6
            </button>
            <button
              type="button"
              title="Delete F8"
              onClick={() => {
                if (!selectedPaths.length) return
                if (!confirm(`Delete ${selectedPaths.length} item(s)?`)) return
                void doDelete()
              }}
            >
              F8
            </button>
            <button type="button" title="Pack / unpack" onClick={() => setArchiveOpen(true)}>
              Arc
            </button>
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
              <option value="">— choose —</option>
              {fileBrowserDests.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} → {p.focusedSide === 'left' ? p.leftPath : p.rightPath}
                </option>
              ))}
            </select>
            {!fileBrowserDests.length && (
              <p className="muted">Add another file browser pane in this workspace.</p>
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
    </div>
  )
}
