import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ListDirEntry } from '../../../shared/contracts'
import { parentDir } from '../../lib/pathUtils'
import { useFolderSize, type FolderSizeState } from './useFolderSize'

const ROW_HEIGHT = 16

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function renderFolderSize(state: FolderSizeState | undefined): ReactNode {
  if (!state || state.status === 'idle') return null
  if (state.status === 'calculating') return <span className="size-calculating" />
  if (state.status === 'streaming') return <span className="size-streaming">{formatSize(state.size ?? 0)}</span>
  if (state.status === 'done') return formatSize(state.size ?? 0)
  if (state.status === 'error') return '--'
  return null
}

type Props = {
  path: string
  entries: ListDirEntry[]
  selected: Set<string>
  focused: boolean
  focusName?: string | null
  renaming: { path: string; name: string } | null
  onRenameChange: (name: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onPathChange: (p: string) => void
  onSelect: (paths: string[], additive: boolean) => void
  onActivate: (entry: ListDirEntry) => void
  onContextMenu?: (e: React.MouseEvent, entry: ListDirEntry) => void
}

export function FileList({
  path,
  entries,
  selected,
  focused,
  focusName,
  renaming,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onPathChange,
  onSelect,
  onActivate,
  onContextMenu
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const anchorIdxRef = useRef<number>(0)
  const { sizes: folderSizes, startCalculation } = useFolderSize(path)

  // Build display entries: ".." parent entry (if not at root) + actual entries
  const norm = path.replace(/[/\\]+$/, '') || path
  const atRoot = norm === '/' || /^[A-Za-z]:$/.test(norm)

  const parentEntry: ListDirEntry | null = atRoot
    ? null
    : { name: '..', path: parentDir(path), isDirectory: true, size: 0, mtimeMs: 0 }

  const displayEntries = parentEntry ? [parentEntry, ...entries] : [...entries]

  // Auto-select a named entry after navigating up (so cursor lands on the folder we came from).
  // We track whether we've already applied the focusName for the current path to avoid re-triggering.
  const appliedFocusRef = useRef<string | null>(null)
  useEffect(() => {
    if (!focusName || entries.length === 0) return
    const key = `${path}:${focusName}`
    if (appliedFocusRef.current === key) return
    const idx = displayEntries.findIndex(e => e.name === focusName)
    if (idx >= 0) {
      appliedFocusRef.current = key
      onSelect([displayEntries[idx].path], false)
      anchorIdxRef.current = idx
      setTimeout(() => virtualizer.scrollToIndex(idx, { align: 'auto' }), 0)
    }
  }, [focusName, path, entries])

  const virtualizer = useVirtualizer({
    count: displayEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15
  })

  // Focus the wrapper when this panel is focused
  useEffect(() => {
    if (focused) {
      wrapRef.current?.focus()
    }
  }, [focused])

  // Find current cursor index from selection
  const getCursorIdx = (): number => {
    if (selected.size === 0) return 0
    const lastSelected = [...selected][selected.size - 1]
    const idx = displayEntries.findIndex((e) => e.path === lastSelected)
    return idx >= 0 ? idx : 0
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cursorIdx = getCursorIdx()

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const nextIdx = Math.min(cursorIdx + 1, displayEntries.length - 1)
        if (e.shiftKey) {
          // Range select from anchor to nextIdx
          const anchor = anchorIdxRef.current
          const start = Math.min(anchor, nextIdx)
          const end = Math.max(anchor, nextIdx)
          const paths = displayEntries.slice(start, end + 1).map((en) => en.path)
          onSelect(paths, false)
        } else {
          anchorIdxRef.current = nextIdx
          onSelect([displayEntries[nextIdx].path], false)
        }
        virtualizer.scrollToIndex(nextIdx, { align: 'auto' })
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const nextIdx = Math.max(cursorIdx - 1, 0)
        if (e.shiftKey) {
          const anchor = anchorIdxRef.current
          const start = Math.min(anchor, nextIdx)
          const end = Math.max(anchor, nextIdx)
          const paths = displayEntries.slice(start, end + 1).map((en) => en.path)
          onSelect(paths, false)
        } else {
          anchorIdxRef.current = nextIdx
          onSelect([displayEntries[nextIdx].path], false)
        }
        virtualizer.scrollToIndex(nextIdx, { align: 'auto' })
        break
      }
      case 'PageDown': {
        e.preventDefault()
        const pageSize = Math.floor((scrollRef.current?.clientHeight ?? 0) / ROW_HEIGHT)
        const nextIdx = Math.min(cursorIdx + pageSize, displayEntries.length - 1)
        anchorIdxRef.current = nextIdx
        onSelect([displayEntries[nextIdx].path], false)
        virtualizer.scrollToIndex(nextIdx, { align: 'auto' })
        break
      }
      case 'PageUp': {
        e.preventDefault()
        const pageSize = Math.floor((scrollRef.current?.clientHeight ?? 0) / ROW_HEIGHT)
        const nextIdx = Math.max(cursorIdx - pageSize, 0)
        anchorIdxRef.current = nextIdx
        onSelect([displayEntries[nextIdx].path], false)
        virtualizer.scrollToIndex(nextIdx, { align: 'auto' })
        break
      }
      case 'Home': {
        e.preventDefault()
        anchorIdxRef.current = 0
        onSelect([displayEntries[0].path], false)
        virtualizer.scrollToIndex(0, { align: 'auto' })
        break
      }
      case 'End': {
        e.preventDefault()
        const lastIdx = displayEntries.length - 1
        anchorIdxRef.current = lastIdx
        onSelect([displayEntries[lastIdx].path], false)
        virtualizer.scrollToIndex(lastIdx, { align: 'auto' })
        break
      }
      case ' ': {
        if (selected.size !== 1) return
        const onlyStr = [...selected][0]
        const spaceEntry = displayEntries.find((x) => x.path === onlyStr)
        if (!spaceEntry || !spaceEntry.isDirectory || spaceEntry.name === '..') return
        e.preventDefault()
        void startCalculation(spaceEntry.path)
        break
      }
      case 'Enter': {
        if (selected.size !== 1) return
        const only = [...selected][0]
        const entry = displayEntries.find((x) => x.path === only)
        if (!entry) return
        e.preventDefault()
        onActivate(entry)
        break
      }
      default:
        break
    }
  }

  const handleRowClick = (
    entry: ListDirEntry,
    index: number,
    ev: React.MouseEvent
  ) => {
    if (ev.shiftKey) {
      // Range select from anchor to clicked index
      const anchor = anchorIdxRef.current
      const start = Math.min(anchor, index)
      const end = Math.max(anchor, index)
      const paths = displayEntries.slice(start, end + 1).map((en) => en.path)
      onSelect(paths, false)
    } else if (ev.metaKey || ev.ctrlKey) {
      anchorIdxRef.current = index
      onSelect([entry.path], true)
    } else {
      anchorIdxRef.current = index
      onSelect([entry.path], false)
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`file-list-wrap ${focused ? 'focused' : ''}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div
        ref={scrollRef}
        style={{ overflow: 'auto', flex: 1, minHeight: 0 }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = displayEntries[virtualRow.index]
            const isSelected = selected.has(entry.path)
            const isParent = entry.name === '..'

            return (
              <div
                key={entry.path}
                className={`file-row ${isSelected ? 'selected' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`
                }}
                onClick={(ev) => {
                  if (isParent) return
                  handleRowClick(entry, virtualRow.index, ev)
                }}
                onContextMenu={(e) => {
                  if (isParent) return
                  onContextMenu?.(e, entry)
                }}
                onDoubleClick={() => {
                  if (isParent) {
                    onPathChange(parentDir(path))
                  } else {
                    onActivate(entry)
                  }
                }}
              >
                {renaming && renaming.path === entry.path ? (
                  <input
                    className="rename-input"
                    value={renaming.name}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onRenameChange(e.target.value)}
                    onBlur={onRenameCommit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); onRenameCommit() }
                      if (e.key === 'Escape') { e.preventDefault(); onRenameCancel() }
                    }}
                  />
                ) : (
                  <span className="name" title={entry.name}>
                    {entry.isDirectory ? '\uD83D\uDCC1 ' : ''}
                    {entry.name}
                  </span>
                )}
                {!isParent && (
                  <span className="muted">
                    {entry.isDirectory ? renderFolderSize(folderSizes[entry.path]) : formatSize(entry.size)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
