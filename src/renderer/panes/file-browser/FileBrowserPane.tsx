import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileBrowserPaneState, ListDirEntry, PaneState } from '../../../shared/contracts'
import { joinPath } from '../../lib/pathUtils'
import { FileList } from './FileList'
import { FileEditor } from './FileEditor'
import { PaneHeader } from '../../layout/PaneHeader'
import { ArchiveDialog } from './ArchiveDialog'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'
import { FileBrowserActions } from './FileBrowserActions'

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
  const [editorState, setEditorState] = useState<{
    path: string
    text: string
    readOnly: boolean
  } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [renaming, setRenaming] = useState<{ path: string; side: 'left' | 'right'; name: string } | null>(null)
  const [editingPath, setEditingPath] = useState<{ side: 'left' | 'right'; value: string } | null>(null)
  const activeJobId = useRef<string | null>(null)
  // Inline prompt state (replaces window.prompt which doesn't work in Electron)
  const [inlinePrompt, setInlinePrompt] = useState<{ label: string; onSubmit: (value: string) => void } | null>(null)
  const [inlinePromptValue, setInlinePromptValue] = useState('')

  const showPrompt = (label: string, onSubmit: (value: string) => void) => {
    setInlinePromptValue('')
    setInlinePrompt({ label, onSubmit })
  }
  // Track folder name to auto-select after navigating up
  const [leftFocusName, setLeftFocusName] = useState<string | null>(null)
  const [rightFocusName, setRightFocusName] = useState<string | null>(null)
  // Path history for Alt+Left/Right back/forward
  const leftHistoryBack = useRef<string[]>([])
  const leftHistoryFwd = useRef<string[]>([])
  const rightHistoryBack = useRef<string[]>([])
  const rightHistoryFwd = useRef<string[]>([])
  const skipHistoryPush = useRef(false)

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

  const refreshActive = useCallback(() => {
    if (pane.focusedSide === 'left') {
      void refreshDir(pane.leftPath).then(setLeftEntries)
    } else {
      void refreshDir(pane.rightPath).then(setRightEntries)
    }
  }, [pane.focusedSide, pane.leftPath, pane.rightPath, refreshDir])

  // Hidden file filter
  const visibleLeftEntries = showHidden ? leftEntries : leftEntries.filter(e => !e.name.startsWith('.'))
  const visibleRightEntries = showHidden ? rightEntries : rightEntries.filter(e => !e.name.startsWith('.'))

  // Safe file extensions that don't need open confirmation
  const SAFE_EXTS = new Set(['.txt','.md','.pdf','.jpg','.jpeg','.png','.gif','.svg','.webp','.bmp','.html','.htm','.css','.json','.xml','.csv','.log','.toml','.yaml','.yml'])

  const navigateTo = useCallback((side: 'left' | 'right', newPath: string) => {
    const oldPath = side === 'left' ? pane.leftPath : pane.rightPath
    if (oldPath === newPath) return
    // Push to history
    if (!skipHistoryPush.current) {
      const back = side === 'left' ? leftHistoryBack : rightHistoryBack
      const fwd = side === 'left' ? leftHistoryFwd : rightHistoryFwd
      back.current.push(oldPath)
      if (back.current.length > 50) back.current.shift()
      fwd.current = []
    }
    skipHistoryPush.current = false
    // Only set focusName when navigating UP (so cursor lands on the folder we came from)
    const normOld = oldPath.replace(/[/\\]+$/, '')
    const normNew = newPath.replace(/[/\\]+$/, '')
    const goingUp = normOld.startsWith(normNew) && normOld !== normNew
    const focusName = goingUp ? normOld.split(/[/\\]/).pop() ?? null : null
    if (side === 'left') {
      setLeftFocusName(focusName)
      onUpdate({ ...pane, focusedSide: 'left', leftPath: newPath })
    } else {
      setRightFocusName(focusName)
      onUpdate({ ...pane, focusedSide: 'right', rightPath: newPath })
    }
  }, [pane, onUpdate])

  const activateEntry = useCallback(
    async (side: 'left' | 'right', entry: ListDirEntry) => {
      if (entry.isDirectory) {
        navigateTo(side, entry.path)
        return
      }
      // Confirm before opening non-safe file types
      const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop()!.toLowerCase() : ''
      if (!SAFE_EXTS.has(ext)) {
        if (!confirm(`Open "${entry.name}" with system default app?`)) return
      }
      const err = await window.ananke.shell.openPath(entry.path)
      if (err) alert(err)
    },
    [navigateTo]
  )

  const openEditor = useCallback(
    async (readOnly: boolean) => {
      if (selectedPaths.length !== 1) return
      const filePath = selectedPaths[0]
      const side = pane.focusedSide === 'left' ? leftEntries : rightEntries
      const entry = side.find((e) => e.path === filePath)
      if (!entry || entry.isDirectory) return
      try {
        const text = await window.ananke.fs.readUtf8(filePath)
        setEditorState({ path: filePath, text, readOnly })
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err))
      }
    },
    [selectedPaths, pane.focusedSide, leftEntries, rightEntries]
  )

  const saveEditor = useCallback(
    async (newText: string) => {
      if (!editorState) return
      try {
        await window.ananke.fs.writeUtf8(editorState.path, newText)
        setEditorState(null)
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err))
      }
    },
    [editorState]
  )

  const doDelete = useCallback(async () => {
    if (!selectedPaths.length) return
    await window.ananke.fs.quickOp('delete', '', selectedPaths)
    refreshBoth()
    onUpdate({ ...pane, leftSelection: [], rightSelection: [] })
  }, [pane, onUpdate, refreshBoth, selectedPaths])

  const onFileContextMenu = useCallback(
    (e: React.MouseEvent, entry: ListDirEntry) => {
      e.preventDefault()
      const side = pane.focusedSide
      const sel = side === 'left' ? pane.leftSelection : pane.rightSelection
      if (!sel.includes(entry.path)) {
        onUpdate({
          ...pane,
          ...(side === 'left'
            ? { leftSelection: [entry.path] }
            : { rightSelection: [entry.path] })
        })
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, path: entry.path })
    },
    [pane, onUpdate]
  )

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
        setCopyOpen(true)
      }
      if (e.key === 'F6') {
        e.preventDefault()
        setMoveOpen(true)
      }
      if (e.key === 'F7' && !e.altKey) {
        e.preventDefault()
        showPrompt('New folder name:', (name) => {
          void window.ananke.fs.quickOp('mkdir', joinPath(activePath, name))
            .then(() => refreshActive())
            .catch((err: Error) => alert(err.message))
        })
      }
      if (e.key === 'F8') {
        e.preventDefault()
        if (!selectedPaths.length) return
        if (!confirm(`Delete ${selectedPaths.length} item(s)?`)) return
        void doDelete()
      }
      if (e.key === 'F2' && selectedPaths.length === 1) {
        e.preventDefault()
        const entries = pane.focusedSide === 'left' ? leftEntries : rightEntries
        const entry = entries.find(en => en.path === selectedPaths[0])
        if (entry) setRenaming({ path: entry.path, side: pane.focusedSide, name: entry.name })
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        onUpdate({ ...pane, focusedSide: pane.focusedSide === 'left' ? 'right' : 'left' })
      }
      // Ctrl+Right: set right pane to selected folder (when left focused)
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight' && pane.focusedSide === 'left') {
        e.preventDefault()
        const sel = selectedPaths[0]
        if (sel) {
          const entry = leftEntries.find(en => en.path === sel)
          const target = entry?.isDirectory ? entry.path : pane.leftPath
          onUpdate({ ...pane, rightPath: target })
        }
      }
      // Ctrl+Left: set left pane to selected folder (when right focused)
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft' && pane.focusedSide === 'right') {
        e.preventDefault()
        const sel = selectedPaths[0]
        if (sel) {
          const entry = rightEntries.find(en => en.path === sel)
          const target = entry?.isDirectory ? entry.path : pane.rightPath
          onUpdate({ ...pane, leftPath: target })
        }
      }
      // Alt+Left: navigate back in history
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        const back = pane.focusedSide === 'left' ? leftHistoryBack : rightHistoryBack
        const fwd = pane.focusedSide === 'left' ? leftHistoryFwd : rightHistoryFwd
        if (back.current.length > 0) {
          const prev = back.current.pop()!
          fwd.current.push(activePath)
          skipHistoryPush.current = true
          navigateTo(pane.focusedSide, prev)
        }
      }
      // Alt+F7: create new file
      if (e.altKey && e.key === 'F7') {
        e.preventDefault()
        showPrompt('New file name:', (name) => {
          void window.ananke.fs.createFile(joinPath(activePath, name))
            .then(() => refreshActive())
            .catch((err: Error) => alert(err.message))
        })
      }
      // Alt+Right: navigate forward in history
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        const back = pane.focusedSide === 'left' ? leftHistoryBack : rightHistoryBack
        const fwd = pane.focusedSide === 'left' ? leftHistoryFwd : rightHistoryFwd
        if (fwd.current.length > 0) {
          const next = fwd.current.pop()!
          back.current.push(activePath)
          skipHistoryPush.current = true
          navigateTo(pane.focusedSide, next)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, selectedPaths, doDelete, openEditor, activePath, refreshActive, pane, leftEntries, rightEntries, onUpdate, navigateTo])

  useEffect(() => {
    if (!isActive) return
    const onGlobalAction = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (detail === 'F3') void openEditor(true)
      else if (detail === 'F4') void openEditor(false)
      else if (detail === 'F5') setCopyOpen(true)
      else if (detail === 'F6') setMoveOpen(true)
      else if (detail === 'F8') {
        if (!selectedPaths.length) return
        if (!confirm(`Delete ${selectedPaths.length} item(s)?`)) return
        void doDelete()
      }
      else if (detail === 'Arc') setArchiveOpen(true)
    }
    window.addEventListener('global-action', onGlobalAction)
    return () => window.removeEventListener('global-action', onGlobalAction)
  }, [isActive, openEditor, selectedPaths, doDelete])

  useEffect(() => {
    if (!isActive) return
    const onRadarNav = (e: Event) => {
      const path = (e as CustomEvent<string>).detail
      if (!path) return
      onUpdate({
        ...pane,
        ...(pane.focusedSide === 'left'
          ? { leftPath: path, focusedSide: 'left' as const }
          : { rightPath: path, focusedSide: 'right' as const })
      })
    }
    window.addEventListener('radar-navigate', onRadarNav)
    return () => window.removeEventListener('radar-navigate', onRadarNav)
  }, [isActive, pane, onUpdate])

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

  const renamingInFlight = useRef(false)
  const commitRename = async () => {
    if (!renaming || renamingInFlight.current) return
    const newName = renaming.name.trim()
    if (!newName || newName === renaming.path.split(/[/\\]/).pop()) { setRenaming(null); return }
    const dir = renaming.side === 'left' ? pane.leftPath : pane.rightPath
    const newPath = joinPath(dir, newName)
    renamingInFlight.current = true
    try {
      await window.ananke.fs.rename(renaming.path, newPath)
      setRenaming(null)
      refreshBoth()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      renamingInFlight.current = false
    }
  }

  const suggestedArchive = joinPath(activePath, 'archive.zip')

  const ctxItems: ContextMenuItem[] = ctxMenu
    ? [
        {
          label: 'Open', shortcut: 'Enter', onClick: () => {
            const entries = pane.focusedSide === 'left' ? leftEntries : rightEntries
            const entry = entries.find((e) => e.path === ctxMenu.path)
            if (entry) void activateEntry(pane.focusedSide, entry)
          }
        },
        { label: 'Read', shortcut: 'F3', onClick: () => void openEditor(true) },
        { label: 'Edit', shortcut: 'F4', onClick: () => void openEditor(false) },
        {
          label: 'Rename', shortcut: 'F2', onClick: () => {
            const entries = pane.focusedSide === 'left' ? leftEntries : rightEntries
            const entry = entries.find(en => en.path === ctxMenu.path)
            if (entry) setRenaming({ path: entry.path, side: pane.focusedSide, name: entry.name })
          }
        },
        { label: 'Copy Path', onClick: () => void window.ananke.clipboard.writeText(ctxMenu.path) },
        { label: '', separator: true, onClick: () => {} },
        { label: 'Copy…', shortcut: 'F5', onClick: () => setCopyOpen(true) },
        { label: 'Move…', shortcut: 'F6', onClick: () => setMoveOpen(true) },
        { label: 'Archive…', onClick: () => setArchiveOpen(true) },
        { label: '', separator: true, onClick: () => {} },
        {
          label: 'New File', shortcut: 'Alt+F7', onClick: () => {
            showPrompt('New file name:', (name) => {
              void window.ananke.fs.createFile(joinPath(activePath, name))
                .then(() => refreshActive())
                .catch((err: Error) => alert(err.message))
            })
          }
        },
        {
          label: 'New Terminal Here', onClick: () => {
            const entries = pane.focusedSide === 'left' ? leftEntries : rightEntries
            const sel = entries.find(e => e.path === ctxMenu.path)
            const dir = sel?.isDirectory ? sel.path : activePath
            window.dispatchEvent(new CustomEvent('create-pane', { detail: { type: 'terminal', cwd: dir } }))
          }
        },
        {
          label: 'New GitUI Here', onClick: () => {
            const entries = pane.focusedSide === 'left' ? leftEntries : rightEntries
            const sel = entries.find(e => e.path === ctxMenu.path)
            const dir = sel?.isDirectory ? sel.path : activePath
            window.dispatchEvent(new CustomEvent('create-pane', { detail: { type: 'gitui', cwd: dir } }))
          }
        },
        ...(window.ananke.platform !== 'win32' ? [{
          label: 'Set Execute Permission', onClick: () => {
            void window.ananke.fs.chmod(ctxMenu.path, '755')
              .then(() => refreshActive())
              .catch((err: Error) => alert(err.message))
          }
        }] : []),
        { label: '', separator: true, onClick: () => {} },
        {
          label: 'Delete', shortcut: 'F8', danger: true, onClick: () => {
            if (!selectedPaths.length) return
            if (!confirm(`Delete ${selectedPaths.length} item(s)?`)) return
            void doDelete()
          }
        },
      ]
    : []

  const renderPathBar = (side: 'left' | 'right') => {
    const currentPath = side === 'left' ? pane.leftPath : pane.rightPath
    if (editingPath?.side === side) {
      return (
        <input
          className="path-bar path-bar--editing"
          value={editingPath.value}
          onChange={(e) => setEditingPath({ side, value: e.target.value })}
          onBlur={() => setEditingPath(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onUpdate({ ...pane, [side === 'left' ? 'leftPath' : 'rightPath']: editingPath.value })
              setEditingPath(null)
            }
            if (e.key === 'Escape') setEditingPath(null)
          }}
          autoFocus
        />
      )
    }
    return (
      <div className="path-bar" title={currentPath} onClick={() => setEditingPath({ side, value: currentPath })}>
        {currentPath}
      </div>
    )
  }

  return (
    <div className={`pane-tile ${isActive ? 'active' : ''} ${pane.needsAttention ? 'attention' : ''}`}>
      <PaneHeader 
        title={pane.title} 
        paneType="file-browser" 
        onClose={onClose} 
        actions={
          <FileBrowserActions
            onRead={() => void openEditor(true)}
            onEdit={() => void openEditor(false)}
            onCopy={() => setCopyOpen(true)}
            onMove={() => setMoveOpen(true)}
            onNewFolder={() => {
              showPrompt('New folder name:', (name) => {
                void window.ananke.fs.quickOp('mkdir', joinPath(activePath, name))
                  .then(() => refreshActive())
                  .catch((err: Error) => alert(err.message))
              })
            }}
            onNewFile={() => {
              showPrompt('New file name:', (name) => {
                void window.ananke.fs.createFile(joinPath(activePath, name))
                  .then(() => refreshActive())
                  .catch((err: Error) => alert(err.message))
              })
            }}
            onDelete={() => {
              if (!selectedPaths.length) return
              if (!confirm(`Delete ${selectedPaths.length} item(s)?`)) return
              void doDelete()
            }}
            onArchive={() => setArchiveOpen(true)}
            onToggleHidden={() => setShowHidden(h => !h)}
            onCopyPath={() => {
              if (selectedPaths.length === 1) void window.ananke.clipboard.writeText(selectedPaths[0])
              else void window.ananke.clipboard.writeText(activePath)
            }}
            onNewTerminal={() => {
              const selDir = selectedPaths.length === 1
                ? (pane.focusedSide === 'left' ? leftEntries : rightEntries).find(e => e.path === selectedPaths[0] && e.isDirectory)?.path
                : undefined
              window.dispatchEvent(new CustomEvent('create-pane', { detail: { type: 'terminal', cwd: selDir || activePath } }))
            }}
            onNewGitUI={() => {
              const selDir = selectedPaths.length === 1
                ? (pane.focusedSide === 'left' ? leftEntries : rightEntries).find(e => e.path === selectedPaths[0] && e.isDirectory)?.path
                : undefined
              window.dispatchEvent(new CustomEvent('create-pane', { detail: { type: 'gitui', cwd: selDir || activePath } }))
            }}
            onChmod={window.ananke.platform !== 'win32' ? () => {
              if (selectedPaths.length !== 1) return
              void window.ananke.fs.chmod(selectedPaths[0], '755')
                .then(() => refreshActive())
                .catch((err: Error) => alert(err.message))
            } : undefined}
          />
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
            <div className="file-list-panel">
              {renderPathBar('left')}
              <FileList
                path={pane.leftPath}
                entries={visibleLeftEntries}
                selected={leftSel}
                focused={pane.focusedSide === 'left'}
                focusName={leftFocusName}
                renaming={renaming?.side === 'left' ? renaming : null}
                onRenameChange={(name) => setRenaming(r => r ? { ...r, name } : null)}
                onRenameCommit={commitRename}
                onRenameCancel={() => setRenaming(null)}
                onPathChange={(p) => navigateTo('left', p)}
                onSelect={(paths, add) => {
                  const next = add ? new Set([...pane.leftSelection, ...paths]) : new Set(paths)
                  onUpdate({
                    ...pane,
                    focusedSide: 'left',
                    leftSelection: [...next]
                  })
                }}
                onActivate={(entry) => void activateEntry('left', entry)}
                onContextMenu={onFileContextMenu}
              />
            </div>
            <div className="file-list-panel">
              {renderPathBar('right')}
              <FileList
                path={pane.rightPath}
                entries={visibleRightEntries}
                selected={rightSel}
                focused={pane.focusedSide === 'right'}
                focusName={rightFocusName}
                renaming={renaming?.side === 'right' ? renaming : null}
                onRenameChange={(name) => setRenaming(r => r ? { ...r, name } : null)}
                onRenameCommit={commitRename}
                onRenameCancel={() => setRenaming(null)}
                onPathChange={(p) => navigateTo('right', p)}
                onSelect={(paths, add) => {
                  const next = add ? new Set([...pane.rightSelection, ...paths]) : new Set(paths)
                  onUpdate({
                    ...pane,
                    focusedSide: 'right',
                    rightSelection: [...next]
                  })
                }}
                onActivate={(entry) => void activateEntry('right', entry)}
                onContextMenu={onFileContextMenu}
              />
            </div>
          </div>
          {ctxMenu && (
            <ContextMenu
              x={ctxMenu.x}
              y={ctxMenu.y}
              items={ctxItems}
              onClose={() => setCtxMenu(null)}
            />
          )}
          </div>
          <div className="fb-status-bar">
            {pane.focusedSide === 'left' ? (
              `${pane.leftSelection.length} selected · ${visibleLeftEntries.length} items`
            ) : (
              `${pane.rightSelection.length} selected · ${visibleRightEntries.length} items`
            )}
          </div>
        </div>
      </div>

      {(copyOpen || moveOpen) && createPortal(
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
        </div>,
        document.body
      )}

      {archiveOpen && createPortal(
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
        />,
        document.body
      )}

      {inlinePrompt && createPortal(
        <div className="modal-backdrop" role="presentation" onClick={() => setInlinePrompt(null)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()} style={{ minWidth: 320 }}>
            <h2>{inlinePrompt.label}</h2>
            <form onSubmit={(e) => {
              e.preventDefault()
              const val = inlinePromptValue.trim()
              if (val) {
                inlinePrompt.onSubmit(val)
                setInlinePrompt(null)
              }
            }}>
              <input
                autoFocus
                value={inlinePromptValue}
                onChange={(e) => setInlinePromptValue(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
                onKeyDown={(e) => { if (e.key === 'Escape') setInlinePrompt(null) }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setInlinePrompt(null)}>Cancel</button>
                <button type="submit" className="primary" disabled={!inlinePromptValue.trim()}>OK</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {editorState && createPortal(
        <FileEditor
          path={editorState.path}
          text={editorState.text}
          readOnly={editorState.readOnly}
          onSave={saveEditor}
          onClose={() => setEditorState(null)}
        />,
        document.body
      )}
    </div>
  )
}
