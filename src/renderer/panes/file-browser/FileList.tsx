import { useEffect, useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ListDirEntry } from '../../../shared/contracts'
import { parentDir } from '../../lib/pathUtils'
import { useFolderSize, type FolderSizeState } from './useFolderSize'
import { useFileListKeyboard } from './useFileListKeyboard'
import { useFileListTypeahead } from './useFileListTypeahead'

const ROW_HEIGHT = 16

export type SortKey = 'name' | 'size' | 'date' | 'kind'
export type SortDir = 'asc' | 'desc'
export type SortState = { key: SortKey; dir: SortDir }

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
  sort: SortState
  onSortChange: (next: SortState) => void
  filterActive: boolean
  filterText: string
  onFilterChange: (text: string) => void
  onFilterOpen: () => void
  onFilterClose: () => void
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
  sort,
  onSortChange,
  filterActive,
  filterText,
  onFilterChange,
  onFilterOpen,
  onFilterClose,
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
  const filterInputRef = useRef<HTMLInputElement>(null)
  const { resolveTypeahead } = useFileListTypeahead()
  const { sizes: folderSizes, startCalculation } = useFolderSize(path)

  // Build display entries: ".." parent entry (if not at root) + actual entries
  const norm = path.replace(/[/\\]+$/, '') || path
  const atRoot = norm === '/' || /^[A-Za-z]:$/.test(norm)

  const parentEntry: ListDirEntry | null = atRoot
    ? null
    : { name: '..', path: parentDir(path), isDirectory: true, size: 0, mtimeMs: 0 }

  const displayEntries = parentEntry ? [parentEntry, ...entries] : [...entries]

  // Auto-select a named entry after navigating up (so cursor lands on the folder we came from).
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

  // Focus the wrapper when this panel is focused (unless filter input is active)
  useEffect(() => {
    if (focused && !filterActive) {
      wrapRef.current?.focus()
    }
  }, [focused, filterActive])

  // Auto-focus filter input when activated
  useEffect(() => {
    if (filterActive && focused) {
      filterInputRef.current?.focus()
    }
  }, [filterActive, focused])

  // Find current cursor index from selection
  const getCursorIdx = (): number => {
    if (selected.size === 0) return 0
    const lastSelected = [...selected][selected.size - 1]
    const idx = displayEntries.findIndex((e) => e.path === lastSelected)
    return idx >= 0 ? idx : 0
  }

  const toggleSort = (key: SortKey) => {
    onSortChange({
      key,
      dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc'
    })
  }

  const sortIndicator = (key: SortKey) => {
    if (sort.key !== key) return ''
    return sort.dir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  const { onKeyDown } = useFileListKeyboard({
    displayEntries,
    selected,
    getCursorIdx,
    anchorIdxRef,
    scrollRef,
    virtualizer,
    onSelect,
    onActivate,
    onFilterOpen,
    startCalculation,
    resolveTypeahead
  })

  const handleRowClick = (
    entry: ListDirEntry,
    index: number,
    ev: React.MouseEvent
  ) => {
    if (ev.shiftKey) {
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
      role="listbox"
      aria-label={`Files in ${path}`}
      aria-multiselectable="true"
      onKeyDown={onKeyDown}
    >
      {/* Horizontal scroll wrapper — prevents name column from shrinking on pane resize */}
      <div className="file-list-hscroll">
        <div className="file-list-inner">
          {/* Column headers */}
          <div className="file-col-headers">
            <span
              className={`file-col-header file-col-header--name${sort.key === 'name' ? ' active' : ''}`}
              onClick={() => toggleSort('name')}
            >
              Name{sortIndicator('name')}
            </span>
            <span
              className={`file-col-header file-col-header--size${sort.key === 'size' ? ' active' : ''}`}
              onClick={() => toggleSort('size')}
            >
              Size{sortIndicator('size')}
            </span>
            <span
              className={`file-col-header file-col-header--date${sort.key === 'date' ? ' active' : ''}`}
              onClick={() => toggleSort('date')}
            >
              Date{sortIndicator('date')}
            </span>
            <span
              className={`file-col-header file-col-header--kind${sort.key === 'kind' ? ' active' : ''}`}
              onClick={() => toggleSort('kind')}
            >
              Kind{sortIndicator('kind')}
            </span>
          </div>

          {/* Filter bar */}
          {filterActive && (
            <div className="file-filter-bar">
              <input
                ref={filterInputRef}
                className="file-filter-input"
                placeholder="Filter..."
                value={filterText}
                onChange={e => onFilterChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { e.stopPropagation(); onFilterClose() }
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.stopPropagation()
                  if (e.key === 'Enter') { e.stopPropagation(); wrapRef.current?.focus() }
                }}
              />
              <span className="file-filter-count">{entries.length} match{entries.length !== 1 ? 'es' : ''}</span>
              <button type="button" className="file-filter-close" onClick={onFilterClose} tabIndex={-1}>&times;</button>
            </div>
          )}

          <div
            ref={scrollRef}
            style={{ overflowY: 'auto', overflowX: 'hidden', scrollbarGutter: 'stable', flex: 1, minHeight: 0 }}
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
                    role="option"
                    aria-selected={isSelected}
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
                        {entry.name.length > 100 ? entry.name.slice(0, 97) + '…' : entry.name}
                      </span>
                    )}
                    {!isParent && (
                      <>
                        <span className="muted file-col--size">
                          {entry.isDirectory ? renderFolderSize(folderSizes[entry.path]) : formatSize(entry.size)}
                        </span>
                        <span className="muted file-col--date">
                          {formatDate(entry.mtimeMs)}
                        </span>
                        <span className="muted file-col--kind">
                          {entry.isDirectory ? '' : (entry.name.includes('.') ? entry.name.split('.').pop()!.toUpperCase() : '')}
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
