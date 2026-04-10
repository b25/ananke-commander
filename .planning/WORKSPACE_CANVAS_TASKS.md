# Workspace 2D Canvas — Task List
Date: 2026-04-09

## Status Legend
- [ ] TODO
- [x] DONE
- [~] IN PROGRESS

---

## Task 1 — contracts.ts: add geometry fields
- [x] Add `x, y, width, height: number` to `PaneStateBase`
- [x] Add `canvasOffset: { x: number; y: number }` to `WorkspaceState`

## Task 2 — stateStore.ts: geometry + clone methods
- [x] Add `DEFAULT_PANE_SIZES` map per PaneType
- [x] Add stagger offset (+30px per pane) in `createDefaultWorkspace()`
- [x] Add `updatePaneGeometry(wsId, paneId, x, y, w, h)` method
- [x] Add `setCanvasOffset(wsId, x, y)` method
- [x] Add `cloneWorkspace(wsId)` method (deep clone with new UUIDs)
- [x] Migration: inject default geometry + canvasOffset into panes/workspaces missing it on load

## Task 3 — IPC handlers in index.ts
- [x] Register `state:updatePaneGeometry` handler
- [x] Register `state:setCanvasOffset` handler
- [x] Register `state:cloneWorkspace` handler

## Task 4 — Preload bridge
- [x] Expose `updatePaneGeometry` on `window.ananke.state`
- [x] Expose `setCanvasOffset` on `window.ananke.state`
- [x] Expose `cloneWorkspace` on `window.ananke.state`

## Task 5 — FloatingPane component (new)
- [x] Title bar drag-to-move (detects `.pane-header` clicks, skips buttons)
- [x] 8 resize handles (N, S, E, W, NE, NW, SE, SW)
- [x] Min size enforcement (300×200)
- [x] `onGeometryChange(x, y, w, h)` callback fired on mouse-up
- [x] z-index raise on active pane

## Task 6 — CanvasWorkspace component (new)
- [x] Outer div: `overflow: hidden`, full viewport
- [x] Inner canvas: `position: absolute`, large (8000×8000px), offset via transform
- [x] Render each pane in `<FloatingPane>` at its x/y/w/h
- [x] Alt+Arrow keys pan canvas by 100px steps
- [x] Calls `onCanvasOffsetChange(x, y)` → persisted via IPC

## Task 7 — RadarMinimap component (new)
- [x] Fixed 220×160px overlay (bottom-right corner)
- [x] Scale factor = minimap_size / canvas_size
- [x] Render each pane as a colored rect (color per type)
- [x] Render green viewport rect (based on canvas offset + window size)
- [x] Click on radar → pan canvas to clicked position
- [x] Drag on radar → continuous pan

## Task 8 — WorkspaceRail clone menu
- [x] Add `onContextMenu` handler on workspace tab buttons
- [x] Show context menu with "Clone Workspace" option
- [x] Call `window.ananke.state.cloneWorkspace(id)` and refresh state

## Task 9 — App.tsx integration
- [x] Remove `<PaneGrid>` import + usage
- [x] Add `<CanvasWorkspace>` with workspace + callbacks
- [x] Add `<RadarMinimap>` overlay
- [x] Wire `onCanvasOffsetChange` and `onGeometryChange` callbacks
- [x] New panes created with default x/y/width/height

## Task 10 — CSS updates
- [x] `.canvas-workspace` styles
- [x] `.floating-pane` styles (absolute, border, shadow)
- [x] `.pane-header` drag cursor inside floating pane
- [x] 8 directional `.fp-resize--*` handles
- [x] `.radar-minimap` styles (fixed overlay, semi-transparent)

## TypeScript check
- [x] `npx tsc --noEmit` — CLEAN (0 errors)
