import type { ListDirEntry } from '../../../shared/contracts'
import type { SortState } from './FileList'

export function applyFilterAndSort(
  entries: ListDirEntry[],
  hidden: boolean,
  filterActive: boolean,
  filterText: string,
  sort: SortState
): ListDirEntry[] {
  let result = hidden ? entries : entries.filter(e => !e.name.startsWith('.'))
  if (filterActive && filterText) {
    const lower = filterText.toLowerCase()
    result = result.filter(e => e.name.toLowerCase().includes(lower))
  }
  result = [...result].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    let cmp = 0
    if (sort.key === 'name') cmp = a.name.localeCompare(b.name)
    else if (sort.key === 'size') cmp = a.size - b.size
    else if (sort.key === 'date') cmp = a.mtimeMs - b.mtimeMs
    else if (sort.key === 'kind') {
      const extA = a.name.includes('.') ? a.name.slice(a.name.lastIndexOf('.')) : ''
      const extB = b.name.includes('.') ? b.name.slice(b.name.lastIndexOf('.')) : ''
      cmp = extA.localeCompare(extB)
    }
    return sort.dir === 'asc' ? cmp : -cmp
  })
  return result
}

export function togglePaths(existing: string[], paths: string[], additive: boolean): string[] {
  if (!additive) return [...new Set(paths)]
  const next = new Set(existing)
  for (const p of paths) {
    if (next.has(p)) next.delete(p)
    else next.add(p)
  }
  return [...next]
}
