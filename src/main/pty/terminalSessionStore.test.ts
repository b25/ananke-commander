import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeSessionEntries } from './terminalSessionMerge.ts'
import type { TerminalSessionMeta } from '../../shared/contracts.js'

function makeMeta(id: string): TerminalSessionMeta {
  return { id, paneId: id, title: 't', cwd: '/tmp', startedAt: 0, endedAt: 1, lineCount: 1 }
}

test('mergeSessionEntries: incoming prepended before existing', () => {
  const existing = [makeMeta('a'), makeMeta('b')]
  const incoming = [makeMeta('c'), makeMeta('d')]
  const { kept, toDelete } = mergeSessionEntries(existing, incoming, 10)
  assert.deepEqual(kept.map(m => m.id), ['c', 'd', 'a', 'b'])
  assert.equal(toDelete.length, 0)
})

test('mergeSessionEntries: trims to maxSessions and returns overflow as toDelete', () => {
  const existing = [makeMeta('a'), makeMeta('b'), makeMeta('c')]
  const incoming = [makeMeta('d'), makeMeta('e')]
  const { kept, toDelete } = mergeSessionEntries(existing, incoming, 4)
  assert.deepEqual(kept.map(m => m.id), ['d', 'e', 'a', 'b'])
  assert.deepEqual(toDelete.map(m => m.id), ['c'])
})

test('mergeSessionEntries: empty existing keeps all incoming', () => {
  const { kept, toDelete } = mergeSessionEntries([], [makeMeta('x')], 5)
  assert.equal(kept.length, 1)
  assert.equal(kept[0].id, 'x')
  assert.equal(toDelete.length, 0)
})

test('mergeSessionEntries: empty incoming preserves existing unchanged', () => {
  const existing = [makeMeta('a'), makeMeta('b')]
  const { kept, toDelete } = mergeSessionEntries(existing, [], 5)
  assert.deepEqual(kept.map(m => m.id), ['a', 'b'])
  assert.equal(toDelete.length, 0)
})

test('mergeSessionEntries: maxSessions=0 moves all to toDelete', () => {
  const { kept, toDelete } = mergeSessionEntries([makeMeta('a')], [makeMeta('b')], 0)
  assert.equal(kept.length, 0)
  assert.equal(toDelete.length, 2)
})

test('mergeSessionEntries: incoming appear before existing in kept order', () => {
  // Simulates: 2 existing saved sessions + 3 new sessions at quit
  const existing = [makeMeta('old1'), makeMeta('old2')]
  const incoming = [makeMeta('new1'), makeMeta('new2'), makeMeta('new3')]
  const { kept, toDelete } = mergeSessionEntries(existing, incoming, 4)
  // newest (incoming) first, then existing
  assert.deepEqual(kept.map(m => m.id), ['new1', 'new2', 'new3', 'old1'])
  assert.deepEqual(toDelete.map(m => m.id), ['old2'])
})
