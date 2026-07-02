import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AppStateSnapshot, WorkspaceState } from '../../shared/contracts.ts'
import { DEFAULT_SETTINGS } from '../../shared/contracts.ts'
import { activePaneUnchanged, toLeanSnapshot } from './stateStoreUtils.ts'

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

// ── toLeanSnapshot (PERF-5 / Task 19) ──────────────────────────────────────────────────────────

function makeSnap(overrides?: Partial<AppStateSnapshot>): AppStateSnapshot {
  return {
    workspaces: [],
    activeWorkspaceId: 'ws1',
    settings: DEFAULT_SETTINGS,
    recentlyClosed: [],
    ...overrides
  }
}

test('toLeanSnapshot: clears recentlyClosed content', () => {
  const snap = makeSnap({
    recentlyClosed: [
      {
        id: 'e1',
        closedAt: 1000,
        snapshot: {
          id: 'p1', type: 'notes', title: 'Note', body: 'very long body text',
          x: 0, y: 0, width: 800, height: 600, xPct: 0, yPct: 0, wPct: 0.5, hPct: 0.5
        }
      }
    ]
  })
  const lean = toLeanSnapshot(snap)
  assert.deepEqual(lean.recentlyClosed, [], 'lean snapshot must have empty recentlyClosed')
})

test('toLeanSnapshot: preserves workspaces, activeWorkspaceId, and settings by reference', () => {
  const snap = makeSnap({ recentlyClosed: [{ id: 'e2', closedAt: 2000, snapshot: { id: 'p2', type: 'notes', title: 'N', body: '', x:0,y:0,width:0,height:0,xPct:0,yPct:0,wPct:0,hPct:0 } }] })
  const lean = toLeanSnapshot(snap)
  assert.equal(lean.workspaces, snap.workspaces, 'workspaces reference preserved')
  assert.equal(lean.activeWorkspaceId, snap.activeWorkspaceId)
  assert.equal(lean.settings, snap.settings, 'settings reference preserved')
})

test('toLeanSnapshot: does not mutate the original snapshot', () => {
  const snap = makeSnap({ recentlyClosed: [{ id: 'e3', closedAt: 3000, snapshot: { id: 'p3', type: 'notes', title: 'N', body: '', x:0,y:0,width:0,height:0,xPct:0,yPct:0,wPct:0,hPct:0 } }] })
  toLeanSnapshot(snap)
  assert.equal(snap.recentlyClosed.length, 1, 'original recentlyClosed must be untouched')
})
