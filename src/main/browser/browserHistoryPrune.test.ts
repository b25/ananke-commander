import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { pruneHistories } from './browserHistoryPrune.ts'
import type { HistoryEntry } from './browserHistoryService.ts'

const entry = (url: string): HistoryEntry => ({ url, timestamp: 1000 })

describe('pruneHistories', () => {
  test('keeps all buckets when all paneIds are live', () => {
    const histories = {
      'pane-1': [entry('https://example.com')],
      'pane-2': [entry('https://other.com')]
    }
    const result = pruneHistories(histories, new Set(['pane-1', 'pane-2']))
    assert.deepEqual(result, histories)
  })

  test('drops orphaned buckets whose paneId is not in liveIds', () => {
    const histories = {
      'pane-live': [entry('https://live.com')],
      'pane-orphan': [entry('https://orphan.com')]
    }
    const result = pruneHistories(histories, new Set(['pane-live']))
    assert.ok('pane-live' in result, 'live pane must be kept')
    assert.ok(!('pane-orphan' in result), 'orphan must be dropped')
    assert.equal(Object.keys(result).length, 1)
  })

  test('returns empty object when liveIds is empty (all orphans)', () => {
    const histories = {
      'pane-a': [entry('https://a.com')],
      'pane-b': [entry('https://b.com')]
    }
    const result = pruneHistories(histories, new Set())
    assert.deepEqual(result, {})
  })

  test('returns empty object when histories is already empty', () => {
    const result = pruneHistories({}, new Set(['pane-1', 'pane-2']))
    assert.deepEqual(result, {})
  })

  test('does not mutate the input histories record', () => {
    const histories: Record<string, HistoryEntry[]> = {
      'pane-orphan': [entry('https://orphan.com')]
    }
    pruneHistories(histories, new Set(['pane-live']))
    assert.ok('pane-orphan' in histories, 'input must not be mutated')
  })

  test('handles multiple entries per bucket correctly', () => {
    const histories = {
      'pane-keep': [entry('https://a.com'), entry('https://b.com')],
      'pane-drop': [entry('https://c.com')]
    }
    const result = pruneHistories(histories, new Set(['pane-keep']))
    assert.equal(result['pane-keep'].length, 2)
    assert.ok(!('pane-drop' in result))
  })
})
