import { type KeyboardEvent, type MutableRefObject } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { ListDirEntry } from '../../../shared/contracts'

const ROW_HEIGHT = 16

type UseFileListKeyboardArgs = {
  displayEntries: ListDirEntry[]
  selected: Set<string>
  getCursorIdx: () => number
  anchorIdxRef: MutableRefObject<number>
  scrollRef: MutableRefObject<HTMLDivElement | null>
  virtualizer: Virtualizer<HTMLDivElement, Element>
  onSelect: (paths: string[], additive: boolean) => void
  onActivate: (entry: ListDirEntry) => void
  onFilterOpen: () => void
  startCalculation: (dirPath: string) => Promise<void>
  resolveTypeahead: (key: string, displayEntries: ListDirEntry[], cursorIdx: number) => number
}

/**
 * Keyboard navigation for the file list: ArrowUp/Down, PageUp/Down, Home/End,
 * Space (folder size), Enter (activate), and typeahead quick-jump.
 */
export function useFileListKeyboard({
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
}: UseFileListKeyboardArgs) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (displayEntries.length === 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
      }
      return
    }
    const cursorIdx = getCursorIdx()

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const nextIdx = Math.min(cursorIdx + 1, displayEntries.length - 1)
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
      default: {
        // Quick-jump: type a letter to jump to matching entry
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) break
        if (e.key === '/') { e.preventDefault(); onFilterOpen(); break }
        e.preventDefault()
        const found = resolveTypeahead(e.key, displayEntries, cursorIdx)
        if (found === -1) break
        anchorIdxRef.current = found
        onSelect([displayEntries[found].path], false)
        virtualizer.scrollToIndex(found, { align: 'auto' })
        break
      }
    }
  }

  return { onKeyDown }
}
