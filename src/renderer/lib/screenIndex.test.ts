import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  offsetToScreenIndex,
  paneCol,
  paneIntersectsViewport,
  paneOnScreen,
  paneRow,
  paneScreenIndex,
  screenIndexToColRow
} from './screenIndex.ts'

describe('paneScreenIndex', () => {
  it('maps quadrants 0–3', () => {
    assert.equal(paneScreenIndex({ xPct: 0.1, yPct: 0.2 }), 0)
    assert.equal(paneScreenIndex({ xPct: 1.05, yPct: 0.1 }), 1)
    assert.equal(paneScreenIndex({ xPct: 0.2, yPct: 1.1 }), 2)
    assert.equal(paneScreenIndex({ xPct: 1.2, yPct: 1.3 }), 3)
  })
})

describe('paneOnScreen', () => {
  it('matches col/row', () => {
    const p = { xPct: 1.1, yPct: 0.4 }
    assert.equal(paneOnScreen(p, 1, 0), true)
    assert.equal(paneOnScreen(p, 0, 0), false)
  })
})

describe('offsetToScreenIndex', () => {
  it('snaps to grid', () => {
    assert.equal(offsetToScreenIndex({ x: 0, y: 0 }, 800, 600), 0)
    assert.equal(offsetToScreenIndex({ x: 800, y: 0 }, 800, 600), 1)
    assert.equal(offsetToScreenIndex({ x: 0, y: 600 }, 800, 600), 2)
  })
})

describe('paneIntersectsViewport', () => {
  it('detects overlap', () => {
    const pane = { x: 100, y: 50, width: 200, height: 100 }
    assert.equal(paneIntersectsViewport(pane, { x: 0, y: 0 }, 800, 600), true)
    assert.equal(paneIntersectsViewport(pane, { x: 800, y: 0 }, 800, 600), false)
  })
})

describe('screenIndexToColRow', () => {
  it('inverts screen index', () => {
    assert.deepEqual(screenIndexToColRow(3), { col: 1, row: 1 })
    assert.equal(paneCol({ xPct: 1.2 }), 1)
    assert.equal(paneRow({ yPct: 1.2 }), 1)
  })
})
