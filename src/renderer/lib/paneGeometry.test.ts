import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaneState } from '../../shared/contracts.ts'
import { PANE_MIN_H, PANE_MIN_W, applyFractions } from './paneGeometry.ts'

const pane = (over: Partial<PaneState>): PaneState =>
  ({ id: 'p', type: 'notes', title: 'N', xPct: 0, yPct: 0, wPct: 0.5, hPct: 0.5, x: 0, y: 0, width: 1, height: 1, ...over }) as unknown as PaneState

test('applyFractions maps fractional coords to pixel geometry', () => {
  const [p] = applyFractions([pane({ xPct: 0.5, yPct: 0, wPct: 0.5, hPct: 1 })], 1000, 800)
  assert.deepEqual([p.x, p.y, p.width, p.height], [500, 0, 500, 800])
})

test('applyFractions clamps to the minimum pane size', () => {
  const [p] = applyFractions([pane({ xPct: 0, yPct: 0, wPct: 0.01, hPct: 0.01 })], 1000, 800)
  assert.equal(p.width, PANE_MIN_W)
  assert.equal(p.height, PANE_MIN_H)
})

test('applyFractions preserves non-geometry fields', () => {
  const [p] = applyFractions([pane({ id: 'keep', title: 'Title' })], 1000, 800)
  assert.equal(p.id, 'keep')
  assert.equal(p.title, 'Title')
})
