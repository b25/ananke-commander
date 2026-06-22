import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ListDirEntry } from '../../../shared/contracts.ts'
import type { SortState } from './FileList'
import { applyFilterAndSort, togglePaths } from './fileBrowserUtils.ts'

const entry = (name: string, over: Partial<ListDirEntry> = {}): ListDirEntry => ({
  name,
  path: `/d/${name}`,
  isDirectory: false,
  size: 0,
  mtimeMs: 0,
  ...over
})
const NAME_ASC: SortState = { key: 'name', dir: 'asc' }

test('togglePaths non-additive replaces the selection (and dedups)', () => {
  assert.deepEqual(togglePaths(['a', 'b'], ['c', 'c'], false), ['c'])
})

test('togglePaths additive adds a new path', () => {
  assert.deepEqual(togglePaths(['a'], ['b'], true).sort(), ['a', 'b'])
})

test('togglePaths additive removes an already-selected path (regression: C5b ctrl-click toggle off)', () => {
  assert.deepEqual(togglePaths(['a', 'b'], ['b'], true), ['a'])
})

test('applyFilterAndSort hides dotfiles unless hidden=true', () => {
  const entries = [entry('.hidden'), entry('visible')]
  assert.deepEqual(applyFilterAndSort(entries, false, false, '', NAME_ASC).map(e => e.name), ['visible'])
  assert.deepEqual(applyFilterAndSort(entries, true, false, '', NAME_ASC).map(e => e.name).sort(), ['.hidden', 'visible'])
})

test('applyFilterAndSort applies a case-insensitive substring filter when active', () => {
  const entries = [entry('Report.pdf'), entry('notes.txt')]
  assert.deepEqual(applyFilterAndSort(entries, false, true, 'REP', NAME_ASC).map(e => e.name), ['Report.pdf'])
})

test('applyFilterAndSort lists directories before files, then by sort key', () => {
  const entries = [entry('zfile'), entry('adir', { isDirectory: true }), entry('afile')]
  assert.deepEqual(
    applyFilterAndSort(entries, false, false, '', NAME_ASC).map(e => e.name),
    ['adir', 'afile', 'zfile']
  )
})

test('applyFilterAndSort honours descending direction', () => {
  const entries = [entry('a'), entry('b')]
  assert.deepEqual(applyFilterAndSort(entries, false, false, '', { key: 'name', dir: 'desc' }).map(e => e.name), ['b', 'a'])
})
