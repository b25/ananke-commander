import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileBrowserPaneState, ListDirEntry, PaneState } from '../../../shared/contracts'
import { joinPath } from '../../lib/pathUtils'
import { FileList, type SortState } from './FileList'
import { FileEditor } from './FileEditor'
import { PaneHeader } from '../../layout/PaneHeader'
import { ArchiveDialog } from './ArchiveDialog'
import { ContextMenu } from './ContextMenu'
import { FileBrowserActions } from './FileBrowserActions'
import { FindBar } from './FindBar'
import { PathBar } from './PathBar'
import { CopyMoveDialog } from './CopyMoveDialog'
import { InlinePromptDialog } from './InlinePromptDialog'
import { applyFilterAndSort, togglePaths } from './fileBrowserUtils'
import { fileContextMenuItems } from './fileContextMenuItems'
import { useDirectoryEntries } from './useDirectoryEntries'
import { useFileJob } from './useFileJob'
import { useFileBrowserNavigation } from './useFileBrowserNavigation'
import { shouldShellHandleShortcut } from '../../lib/keyboardShortcuts'

type FindState = {
  active: boolean
  pattern: string
  recursive: boolean
  results: ListDirEntry[]
  status: 'idle' | 'searching' | 'done' | 'error'
}

function toFindResultEntries(results: ListDirEntry[], root: string): ListDirEntry[] {
  const normRoot = root.replace(/[/\\]+$/, '')
  return results.map(entry => ({
    ...entry,
    name: entry.path.slice(normRoot.length + 1) || entry.name
  }))
}

type Props = {
  pane: FileBrowserPaneState
  isActive: boolean
  allPanes: PaneState[]
  onUpdate: (next: FileBrowserPaneState) => void
  onClose: () => void
}

export function FileBrowserPane({ pane, isActive, allPanes, onUpdate, onClose }: Props) {
  const [copyOpen, setCopyOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [destPaneId, setDestPaneId] = useState<string>('')
  const [editorState, setEditorState] = useState<{
    path: string
    text: string
    readOnly: boolean
  } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; side: 'left' | 'right' } | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [leftSort, setLeftSort] = useState<SortState>({ key: 'name', dir: 'asc' })
  const [rightSort, setRightSort] = useState<SortState>({ key: 'name', dir: 'asc' })
  const [leftFilterActive, setLeftFilterActive] = useState(false)
  const [leftFilterText, setLeftFilterText] = useState('')
  const [rightFilterActive, setRightFilterActive] = useState(false)
  const [rightFilterText, setRightFilterText] = useState('')
  const [renaming, setRenaming] = useState<{ path: string; side: 'left' | 'right'; name: string } | null>(null)
  const [editingPath, setEditingPath] = useState<{ side: 'left' | 'right'; value: string } | null>(null)
  const [leftFind, setLeftFind] = useState<FindState>({ active: false, pattern: '', recursive: true, results: [], status: 'idle' })
  const [rightFind, setRightFind] = useState<FindState>({ active: false, pattern: '', recursive: true, results: [], status: 'idle' })
  // Inline prompt state (replaces window.prompt which doesn't work in Electron)
  const [inlinePrompt, setInlinePrompt] = useState<{ label: string; onSubmit: (value: string) => void } | null>(null)
  const [inlinePromptValue, setInlinePromptValue] = useState('')

  // PERF-4: local selection state — updated synchronously on each keystroke/click,
  // persisted to pane state (and thus disk) debounced at ~300ms.
  // This prevents one disk write + full-app re-render per arrow key repeat.
  const [leftSelLocal, setLeftSelLocal] = useState<string[]>(pane.leftSelection)
  const [rightSelLocal, setRightSelLocal] = useState<string[]>(pane.rightSelection)
  // Always point at the latest pane so the debounce closure doesn't go stale
  const paneRef = useRef(pane)
  paneRef.current = pane
  // Pending selection state and debounce timer for the flush
  const pendingSelRef = useRef<{ left: string[]; right: string[]; side: 'left' | 'right' }>({
    left: pane.leftSelection, right: pane.rightSelection, side: pane.focusedSide
  })
  const selDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local selection from pane when path or pane identity changes (e.g. navigation).
  // Also cancel any pending flush so stale selections from the old path aren't persisted.
  useEffect(() => {
    if (selDebounceRef.current) {
      clearTimeout(selDebounceRef.current)
      selDebounceRef.current = null
    }
    setLeftSelLocal(pane.leftSelection)
    setRightSelLocal(pane.rightSelection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id, pane.leftPath, pane.rightPath])

  // Schedule a debounced persist of the current selection to pane state
  const scheduleSel = useCallback((nextLeft: string[], nextRight: string[], side: 'left' | 'right') => {
    pendingSelRef.current = { left: nextLeft, right: nextRight, side }
    if (selDebounceRef.current) clearTimeout(selDebounceRef.current)
    selDebounceRef.current = setTimeout(() => {
      selDebounceRef.current = null
      const { left, right, side: s } = pendingSelRef.current
      onUpdate({ ...paneRef.current, leftSelection: left, rightSelection: right, focusedSide: s })
    }, 300)
  }, [onUpdate])

  // Cancel pending selection debounce — call before any immediate onUpdate that touches selection
  const cancelSelDebounce = () => {
    if (selDebounceRef.current) {
      clearTimeout(selDebounceRef.current)
      selDebounceRef.current = null
    }
  }

  // Hide WebContentsViews (OS-layer, above all CSS z-index) when a dialog is open
  useEffect(() => {
    window.dispatchEvent(new Event(inlinePrompt ? 'ananke:modal-open' : 'ananke:modal-close'))
  }, [inlinePrompt])

  const showPrompt = (label: string, onSubmit: (value: string) => void) => {
    setInlinePromptValue('')
    setInlinePrompt({ label, onSubmit })
  }
  const { navigateTo, historyBack, historyForward, leftFocusName, rightFocusName } = useFileBrowserNavigation(pane, onUpdate)

  const { leftEntries, rightEntries, refreshBoth, refreshActive } = useDirectoryEntries(pane)
  const { fileJobLine, setFileJobLine, startJob } = useFileJob(refreshBoth)

  // Derive Set views from local state for FileList `selected` prop (fast, no disk hit)
  const leftSel = new Set(leftSelLocal)
  const rightSel = new Set(rightSelLocal)

  const fileBrowserDests = allPanes.filter(
    (p): p is FileBrowserPaneState => p.type === 'file-browser' && p.id !== pane.id
  )

  // selectedPaths reads from local state so operations (delete, copy…) see the latest selection
  const selectedPaths =
    pane.focusedSide === 'left' ? [...leftSelLocal] : [...rightSelLocal]

  const activePath = pane.focusedSide === 'left' ? pane.leftPath : pane.rightPath

  const runFind = async (side: 'left' | 'right', findState: FindState) => {
    const setFind = side === 'left' ? setLeftFind : setRightFind
    const root = side === 'left' ? pane.leftPath : pane.rightPath
    setFind(f => ({ ...f, status: 'searching', results: [] }))
    try {
      const results = await window.ananke.fs.findFiles(root, findState.pattern || '*', findState.recursive)
      setFind(f => ({ ...f, status: 'done', results }))
    } catch {
      setFind(f => ({ ...f, status: 'error' }))
    }
  }

  const visibleLeftEntries = leftFind.active
    ? applyFilterAndSort(toFindResultEntries(leftFind.results, pane.leftPath), true, leftFilterActive, leftFilterText, leftSort)
    : applyFilterAndSort(leftEntries, showHidden, leftFilterActive, leftFilterText, leftSort)
  const visibleRightEntries = rightFind.active
    ? applyFilterAndSort(toFindResultEntries(rightFind.results, pane.rightPath), true, rightFilterActive, rightFilterText, rightSort)
    : applyFilterAndSort(rightEntries, showHidden, rightFilterActive, rightFilterText, rightSort)

  // Safe file extensions that don't need open confirmation
  const SAFE_EXTS = new Set(['.txt','.md','.pdf','.jpg','.jpeg','.png','.gif','.svg','.webp','.bmp','.html','.htm','.css','.json','.xml','.csv','.log','.toml','.yaml','.yml'])

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
    cancelSelDebounce()
    await window.ananke.fs.quickOp('delete', '', selectedPaths)
    refreshBoth()
    setLeftSelLocal([])
    setRightSelLocal([])
    onUpdate({ ...pane, leftSelection: [], rightSelection: [] })
  }, [pane, onUpdate, refreshBoth, selectedPaths])

  const onFileContextMenu = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent, entry: ListDirEntry) => {
      e.preventDefault()
      const sel = side === 'left' ? leftSelLocal : rightSelLocal
      if (!sel.includes(entry.path)) {
        // Immediate selection change: cancel pending debounce and persist now
        cancelSelDebounce()
        const newSel = [entry.path]
        if (side === 'left') {
          setLeftSelLocal(newSel)
          onUpdate({ ...pane, focusedSide: side, leftSelection: newSel, rightSelection: rightSelLocal })
        } else {
          setRightSelLocal(newSel)
          onUpdate({ ...pane, focusedSide: side, leftSelection: leftSelLocal, rightSelection: newSel })
        }
      } else {
        onUpdate({ ...pane, focusedSide: side })
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, path: entry.path, side })
    },
    [pane, onUpdate, leftSelLocal, rightSelLocal]
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
      if (!shouldShellHandleShortcut(e)) return
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
        historyBack(pane.focusedSide, activePath)
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
        historyForward(pane.focusedSide, activePath)
      }
      // Ctrl+F: open find bar for focused panel
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        const setFind = pane.focusedSide === 'left' ? setLeftFind : setRightFind
        setFind(f => ({ ...f, active: true }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, selectedPaths, doDelete, openEditor, activePath, refreshActive, pane, leftEntries, rightEntries, onUpdate, navigateTo, historyBack, historyForward])

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

  // Close find mode when the active directory changes
  useEffect(() => {
    setLeftFind(f => f.active ? { active: false, pattern: '', recursive: true, results: [], status: 'idle' } : f)
  }, [pane.leftPath])

  useEffect(() => {
    setRightFind(f => f.active ? { active: false, pattern: '', recursive: true, results: [], status: 'idle' } : f)
  }, [pane.rightPath])

  const runCopyOrMove = async (kind: 'copy' | 'move') => {
    const destPane = fileBrowserDests.find((p) => p.id === destPaneId)
    if (!destPane || !selectedPaths.length) return
    const destDir = destPane.focusedSide === 'left' ? destPane.leftPath : destPane.rightPath
    setCopyOpen(false)
    setMoveOpen(false)
    setFileJobLine(kind === 'copy' ? 'Copy…' : 'Move…')
    await startJob(kind, selectedPaths, destDir)
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

  const ctxItems = ctxMenu
    ? fileContextMenuItems({
        ctxMenu,
        leftEntries,
        rightEntries,
        pane,
        activateEntry,
        openEditor,
        setRenaming,
        refreshActive,
        refreshBoth,
        onUpdate,
        showPrompt,
        setCopyOpen,
        setMoveOpen,
        setArchiveOpen
      })
    : []

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
              <PathBar
                currentPath={pane.leftPath}
                editingValue={editingPath?.side === 'left' ? editingPath.value : null}
                onBeginEdit={() => setEditingPath({ side: 'left', value: pane.leftPath })}
                onChange={(value) => setEditingPath({ side: 'left', value })}
                onCommit={(value) => { onUpdate({ ...pane, leftPath: value }); setEditingPath(null) }}
                onCancel={() => setEditingPath(null)}
              />
              {leftFind.active && (
                <FindBar
                  pattern={leftFind.pattern}
                  recursive={leftFind.recursive}
                  status={leftFind.status}
                  resultCount={leftFind.results.length}
                  onPatternChange={pattern => setLeftFind(f => ({ ...f, pattern }))}
                  onRecursiveChange={recursive => setLeftFind(f => ({ ...f, recursive }))}
                  onSearch={() => void runFind('left', leftFind)}
                  onClose={() => setLeftFind({ active: false, pattern: '', recursive: true, results: [], status: 'idle' })}
                />
              )}
              <FileList
                path={pane.leftPath}
                entries={visibleLeftEntries}
                selected={leftSel}
                focused={pane.focusedSide === 'left'}
                focusName={leftFocusName}
                renaming={renaming?.side === 'left' ? renaming : null}
                sort={leftSort}
                onSortChange={setLeftSort}
                filterActive={leftFilterActive}
                filterText={leftFilterText}
                onFilterChange={setLeftFilterText}
                onFilterOpen={() => setLeftFilterActive(true)}
                onFilterClose={() => { setLeftFilterActive(false); setLeftFilterText('') }}
                onRenameChange={(name) => setRenaming(r => r ? { ...r, name } : null)}
                onRenameCommit={commitRename}
                onRenameCancel={() => setRenaming(null)}
                onPathChange={(p) => navigateTo('left', p)}
                onSelect={(paths, add) => {
                  const next = togglePaths(leftSelLocal, paths, add)
                  setLeftSelLocal(next)
                  scheduleSel(next, rightSelLocal, 'left')
                }}
                onActivate={(entry) => {
                  if (leftFind.active) setLeftFind({ active: false, pattern: '', recursive: true, results: [], status: 'idle' })
                  void activateEntry('left', entry)
                }}
                onContextMenu={(e, entry) => onFileContextMenu('left', e, entry)}
              />
            </div>
            <div className="file-list-panel">
              <PathBar
                currentPath={pane.rightPath}
                editingValue={editingPath?.side === 'right' ? editingPath.value : null}
                onBeginEdit={() => setEditingPath({ side: 'right', value: pane.rightPath })}
                onChange={(value) => setEditingPath({ side: 'right', value })}
                onCommit={(value) => { onUpdate({ ...pane, rightPath: value }); setEditingPath(null) }}
                onCancel={() => setEditingPath(null)}
              />
              {rightFind.active && (
                <FindBar
                  pattern={rightFind.pattern}
                  recursive={rightFind.recursive}
                  status={rightFind.status}
                  resultCount={rightFind.results.length}
                  onPatternChange={pattern => setRightFind(f => ({ ...f, pattern }))}
                  onRecursiveChange={recursive => setRightFind(f => ({ ...f, recursive }))}
                  onSearch={() => void runFind('right', rightFind)}
                  onClose={() => setRightFind({ active: false, pattern: '', recursive: true, results: [], status: 'idle' })}
                />
              )}
              <FileList
                path={pane.rightPath}
                entries={visibleRightEntries}
                selected={rightSel}
                focused={pane.focusedSide === 'right'}
                focusName={rightFocusName}
                renaming={renaming?.side === 'right' ? renaming : null}
                sort={rightSort}
                onSortChange={setRightSort}
                filterActive={rightFilterActive}
                filterText={rightFilterText}
                onFilterChange={setRightFilterText}
                onFilterOpen={() => setRightFilterActive(true)}
                onFilterClose={() => { setRightFilterActive(false); setRightFilterText('') }}
                onRenameChange={(name) => setRenaming(r => r ? { ...r, name } : null)}
                onRenameCommit={commitRename}
                onRenameCancel={() => setRenaming(null)}
                onPathChange={(p) => navigateTo('right', p)}
                onSelect={(paths, add) => {
                  const next = togglePaths(rightSelLocal, paths, add)
                  setRightSelLocal(next)
                  scheduleSel(leftSelLocal, next, 'right')
                }}
                onActivate={(entry) => {
                  if (rightFind.active) setRightFind({ active: false, pattern: '', recursive: true, results: [], status: 'idle' })
                  void activateEntry('right', entry)
                }}
                onContextMenu={(e, entry) => onFileContextMenu('right', e, entry)}
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
              `${leftSelLocal.length} selected · ${visibleLeftEntries.length} items`
            ) : (
              `${rightSelLocal.length} selected · ${visibleRightEntries.length} items`
            )}
          </div>
        </div>
      </div>

      {(copyOpen || moveOpen) && (
        <CopyMoveDialog
          mode={copyOpen ? 'copy' : 'move'}
          activePath={activePath}
          selectedCount={selectedPaths.length}
          dests={fileBrowserDests}
          destPaneId={destPaneId}
          onDestChange={setDestPaneId}
          onCancel={() => { setCopyOpen(false); setMoveOpen(false) }}
          onConfirm={() => void runCopyOrMove(copyOpen ? 'copy' : 'move')}
        />
      )}

      {archiveOpen && createPortal(
        <ArchiveDialog
          suggestedPackPath={suggestedArchive}
          defaultUnpackDir={activePath}
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

      {inlinePrompt && (
        <InlinePromptDialog
          label={inlinePrompt.label}
          value={inlinePromptValue}
          onChange={setInlinePromptValue}
          onSubmit={() => {
            const val = inlinePromptValue.trim()
            if (val) {
              inlinePrompt.onSubmit(val)
              setInlinePrompt(null)
            }
          }}
          onCancel={() => setInlinePrompt(null)}
        />
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
