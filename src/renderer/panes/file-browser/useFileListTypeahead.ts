import { useRef } from 'react'
import type { ListDirEntry } from '../../../shared/contracts'

/**
 * Typeahead / quick-jump: type a letter to jump to a matching entry.
 * Accumulates typed characters within a 500ms window and resolves the index
 * of the next entry whose name starts with the accumulated prefix.
 */
export function useFileListTypeahead() {
  const typeaheadRef = useRef<{ text: string; timer: ReturnType<typeof setTimeout> | null }>({ text: '', timer: null })

  const resolveTypeahead = (key: string, displayEntries: ListDirEntry[], cursorIdx: number): number => {
    const ta = typeaheadRef.current
    if (ta.timer) clearTimeout(ta.timer)
    ta.text += key.toLowerCase()
    ta.timer = setTimeout(() => { ta.text = '' }, 500)
    const prefix = ta.text
    const total = displayEntries.length
    const searchFrom = (cursorIdx + (prefix.length === 1 ? 1 : 0)) % total
    let found = -1
    for (let i = 0; i < total; i++) {
      const idx = (searchFrom + i) % total
      if (displayEntries[idx].name.toLowerCase().startsWith(prefix)) {
        found = idx
        break
      }
    }
    return found
  }

  return { resolveTypeahead }
}
