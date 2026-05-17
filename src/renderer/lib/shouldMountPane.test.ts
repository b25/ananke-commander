import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldMountPaneContent } from './shouldMountPane.ts'
import type { PaneState } from '../../shared/contracts'

function terminalPane(overrides: Partial<PaneState> = {}): PaneState {
  return {
    id: 'p1',
    type: 'terminal',
    title: 'Term',
    x: 10,
    y: 10,
    width: 400,
    height: 300,
    xPct: 0.1,
    yPct: 0.1,
    wPct: 0.4,
    hPct: 0.4,
    cwd: '/tmp',
    ...overrides
  } as PaneState
}

describe('shouldMountPaneContent', () => {
  const baseCtx = {
    visibleScreenIndex: 0,
    collapsedIds: [] as string[],
    activePaneId: null as string | null,
    canvasOffset: { x: 0, y: 0 },
    vpW: 800,
    vpH: 600
  }

  it('mounts browser on any screen', () => {
    const pane = terminalPane({ type: 'browser', url: 'about:blank' } as PaneState)
    assert.equal(
      shouldMountPaneContent(pane, { ...baseCtx, visibleScreenIndex: 3 }),
      true
    )
  })

  it('skips collapsed panes', () => {
    assert.equal(
      shouldMountPaneContent(terminalPane(), { ...baseCtx, collapsedIds: ['p1'] }),
      false
    )
  })

  it('skips off-screen panes', () => {
    assert.equal(
      shouldMountPaneContent(terminalPane({ xPct: 1.1, yPct: 0.1 }), baseCtx),
      false
    )
  })

  it('mounts active and warmed panes on visible screen', () => {
    const pane = terminalPane()
    const warmed = new Set(['p1'])
    assert.equal(shouldMountPaneContent(pane, { ...baseCtx, activePaneId: 'p1' }), true)
    assert.equal(shouldMountPaneContent(pane, { ...baseCtx, activePaneId: 'other' }, warmed), true)
  })

  it('mounts panes that intersect the viewport', () => {
    const pane = terminalPane({ x: 50, y: 50, width: 200, height: 150 })
    assert.equal(shouldMountPaneContent(pane, baseCtx), true)
  })

  it('does not mount inactive off-viewport panes without warm', () => {
    const pane = terminalPane({
      x: 900,
      y: 700,
      width: 100,
      height: 100,
      xPct: 1.05,
      yPct: 0.1
    })
    assert.equal(shouldMountPaneContent(pane, { ...baseCtx, activePaneId: 'other' }), false)
  })
})
