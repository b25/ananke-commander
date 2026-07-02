import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WorkspaceState } from '../../shared/contracts.ts'
import { activePaneUnchanged } from './stateStoreUtils.ts'

function makeWs(id: string, activePaneId: string | null): WorkspaceState {
  return {
    id,
    name: 'WS',
    activePaneId,
    canvasOffset: { x: 0, y: 0 },
    screenLayouts: {},
    intentLayouts: {},
    screenCollapsed: {},
    panes: []
  } as unknown as WorkspaceState
}

// TDD: these tests drove the activePaneUnchanged guard in stateStore.setActiveWorkspacePane
// (PERF-1 / Task 3). The guard early-returns — preventing store.set + disk write — when
// the workspace already has the given pane active.

test('activePaneUnchanged: returns true when pane is already active (no-op case)', () => {
  const workspaces = [makeWs('ws1', 'p1')]
  assert.equal(activePaneUnchanged(workspaces, 'ws1', 'p1'), true)
})

test('activePaneUnchanged: returns false when workspace has a different active pane', () => {
  const workspaces = [makeWs('ws1', 'p1')]
  assert.equal(activePaneUnchanged(workspaces, 'ws1', 'p2'), false)
})

test('activePaneUnchanged: returns false when workspaceId is not found', () => {
  const workspaces = [makeWs('ws1', 'p1')]
  assert.equal(activePaneUnchanged(workspaces, 'ws-missing', 'p1'), false)
})

test('activePaneUnchanged: returns true for null→null (no active pane remains none)', () => {
  const workspaces = [makeWs('ws1', null)]
  assert.equal(activePaneUnchanged(workspaces, 'ws1', null), true)
})

test('activePaneUnchanged: returns false when switching from null to a pane', () => {
  const workspaces = [makeWs('ws1', null)]
  assert.equal(activePaneUnchanged(workspaces, 'ws1', 'p1'), false)
})

test('activePaneUnchanged: returns false when switching from active pane to null', () => {
  const workspaces = [makeWs('ws1', 'p1')]
  assert.equal(activePaneUnchanged(workspaces, 'ws1', null), false)
})

test('activePaneUnchanged: handles multiple workspaces, targets correct one', () => {
  const workspaces = [makeWs('ws1', 'p1'), makeWs('ws2', 'p2')]
  assert.equal(activePaneUnchanged(workspaces, 'ws2', 'p2'), true)
  assert.equal(activePaneUnchanged(workspaces, 'ws2', 'p1'), false)
  assert.equal(activePaneUnchanged(workspaces, 'ws1', 'p1'), true)
})
