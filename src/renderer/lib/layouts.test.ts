import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PaneState } from '../../shared/contracts.ts'
import {
  LAYOUTS,
  LAYOUT_SLOTS,
  applyLayout,
  bestLayout,
  fittingLayout,
  layoutFits,
  nextProgressionLayout
} from './layouts.ts'

const pane = (id: string, xPct: number, yPct: number): PaneState =>
  ({ id, type: 'notes', title: 'N', xPct, yPct, wPct: 0.5, hPct: 0.5, x: 0, y: 0, width: 1, height: 1 }) as unknown as PaneState

test('LAYOUT_SLOTS matches each layout\'s slot count', () => {
  for (const l of LAYOUTS) {
    assert.equal(LAYOUT_SLOTS[l.id], l.slots.length, `slot count mismatch for ${l.id}`)
  }
})

test('nextProgressionLayout advances within the progression and stops at max', () => {
  assert.equal(nextProgressionLayout('full'), 'halves')
  assert.equal(nextProgressionLayout('halves'), '4-quad')
  assert.equal(nextProgressionLayout('9-grid'), null)
})

test('nextProgressionLayout jumps a manual layout to the next larger progression tier', () => {
  assert.equal(nextProgressionLayout('1h-2v'), '4-quad') // 3 slots -> first tier with >3
  assert.equal(nextProgressionLayout('1h-3v'), '6-grid') // 4 slots -> first tier with >4
  assert.equal(nextProgressionLayout('unknown'), 'halves') // 1 slot -> first tier with >1
})

test('bestLayout picks the right tier for N panes', () => {
  assert.equal(bestLayout(1).id, 'full')
  assert.equal(bestLayout(2).id, 'halves')
  assert.equal(bestLayout(3).id, '1h-2v')
  assert.equal(bestLayout(4).id, '4-quad')
  assert.equal(bestLayout(6).id, '6-grid')
  assert.equal(bestLayout(9).id, '9-grid')
  assert.equal(bestLayout(99).id, '9-grid')
})

test('layoutFits enforces the 300x200 minimum per slot', () => {
  const full = LAYOUTS[0]
  const nine = LAYOUTS.find((l) => l.id === '9-grid')!
  assert.equal(layoutFits(full, 1440, 900), true)
  assert.equal(layoutFits(nine, 1440, 900), true) // 1/3*1440=480, 1/3*900=300
  assert.equal(layoutFits(nine, 800, 900), false) // 1/3*800=266 < 300
})

test('fittingLayout returns intent when it fits, else the largest that fits, never below full', () => {
  assert.equal(fittingLayout('9-grid', 1440, 900), '9-grid')
  assert.equal(fittingLayout('9-grid', 700, 500), '4-quad') // 6-grid h 1/3*500<200; 4-quad fits
  assert.equal(fittingLayout('9-grid', 100, 100), 'full') // nothing fits -> fallback
})

test('applyLayout positions on-screen panes into slots and leaves other screens untouched', () => {
  const onA = pane('a', 0, 0)
  const onB = pane('b', 0.5, 0)
  const offScreen = pane('c', 1, 0) // screen col=1
  const halves = LAYOUTS.find((l) => l.id === 'halves')!
  const out = applyLayout([onA, onB, offScreen], halves, 0, 0, 1000, 800)

  const a = out.find((p) => p.id === 'a')!
  const b = out.find((p) => p.id === 'b')!
  const c = out.find((p) => p.id === 'c')!
  // slot 0 (left half) and slot 1 (right half)
  assert.deepEqual([a.x, a.width, a.height], [0, 500, 800])
  assert.deepEqual([b.x, b.width], [500, 500])
  // off-screen pane is unchanged
  assert.equal(c.xPct, 1)
  assert.equal(c.width, offScreen.width)
})

test('applyLayout leaves panes beyond the slot count in place', () => {
  const full = LAYOUTS[0] // 1 slot
  const a = pane('a', 0, 0)
  const b = pane('b', 0.5, 0)
  const out = applyLayout([a, b], full, 0, 0, 1000, 800)
  const bb = out.find((p) => p.id === 'b')!
  assert.equal(bb.xPct, 0.5) // no slot -> untouched
})
