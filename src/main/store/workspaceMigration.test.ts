import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import type { WorkspaceState } from '../../shared/contracts.ts'
import { injectPaneGeometry, normalizeWorkspaces, sanitizePaths } from './workspaceMigration.ts'

const HOME = homedir()
const MISSING = '/definitely/not/a/real/dir/ananke-test-xyz'

function fileBrowserWs(over: Record<string, unknown> = {}): WorkspaceState {
  return {
    id: 'ws1',
    name: 'WS',
    activePaneId: 'p1',
    canvasOffset: { x: 0, y: 0 },
    screenLayouts: {},
    intentLayouts: {},
    screenCollapsed: {},
    panes: [
      {
        id: 'p1',
        type: 'file-browser',
        title: 'Files',
        x: 0, y: 0, width: 720, height: 450,
        xPct: 0, yPct: 0, wPct: 0.5, hPct: 0.5,
        leftPath: HOME,
        rightPath: HOME,
        focusedSide: 'left',
        leftSelection: [],
        rightSelection: [],
        ...over
      }
    ]
  } as unknown as WorkspaceState
}

test('injectPaneGeometry fills absolute + fractional geometry for legacy panes', () => {
  const raw = [{ id: 'p', type: 'notes', title: 'N', body: '' }] as unknown as WorkspaceState['panes']
  const [p] = injectPaneGeometry(raw)
  assert.equal(typeof p.x, 'number')
  assert.equal(typeof p.width, 'number')
  assert.equal(typeof p.xPct, 'number')
  assert.equal(typeof p.wPct, 'number')
})

test('injectPaneGeometry leaves panes that already have geometry untouched', () => {
  const ws = fileBrowserWs()
  const [p] = injectPaneGeometry(ws.panes)
  assert.deepEqual(p, ws.panes[0])
})

test('sanitizePaths replaces missing file-browser dirs with home, keeps valid ones', () => {
  const ws = fileBrowserWs({ leftPath: MISSING, rightPath: HOME })
  const [out] = sanitizePaths([ws])
  const pane = out.panes[0] as { leftPath: string; rightPath: string }
  assert.equal(pane.leftPath, HOME)
  assert.equal(pane.rightPath, HOME)
})

test('sanitizePaths ignores non-file-browser panes', () => {
  const ws = {
    ...fileBrowserWs(),
    panes: [{ id: 't', type: 'terminal', title: 'T', cwd: MISSING, x: 0, y: 0, width: 1, height: 1, xPct: 0, yPct: 0, wPct: 1, hPct: 1 }]
  } as unknown as WorkspaceState
  const [out] = sanitizePaths([ws])
  assert.equal((out.panes[0] as { cwd: string }).cwd, MISSING)
})

test('normalizeWorkspaces backfills optional workspace fields', () => {
  const ws = { id: 'w', name: 'W', activePaneId: null, panes: [] } as unknown as WorkspaceState
  const [out] = normalizeWorkspaces([ws])
  assert.deepEqual(out.canvasOffset, { x: 0, y: 0 })
  assert.deepEqual(out.screenLayouts, {})
  assert.deepEqual(out.intentLayouts, {})
  assert.deepEqual(out.screenCollapsed, {})
})

test('normalizeWorkspaces is idempotent (justifies normalizing once at load)', () => {
  const ws = fileBrowserWs({ leftPath: MISSING })
  const once = normalizeWorkspaces([ws])
  const twice = normalizeWorkspaces(once)
  assert.deepEqual(twice, once)
})
