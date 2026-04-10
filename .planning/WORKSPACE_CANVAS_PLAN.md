# Workspace 2D Canvas — Implementation Plan
Date: 2026-04-09

## Goal
Transform the workspace from a fixed flexbox grid into a free-form 2D infinite canvas where panes (terminal, browser, file-browser) are independently resizable and freely positionable windows. Add a radar minimap for navigation, Alt+Arrow panning, and workspace clone/paste support.

---

## Feature Breakdown

### F1 — Per-pane geometry (position + size)
Each pane tracks `x, y, width, height` on the canvas. Default sizes per type:
- FileBrowser: 900×600
- Terminal: 700×420
- Browser: 1024×700
- Notes: 600×500
- Radar: 700×500

### F2 — CanvasWorkspace (infinite 2D canvas)
Replace `PaneGrid` with a `CanvasWorkspace` that renders panes at absolute positions via CSS transform. Canvas stores a pan offset `{ x, y }` per workspace.

### F3 — Draggable + Resizable pane windows
Each pane gets a `FloatingPane` wrapper:
- **Drag**: grab title bar → move pane (update x, y)
- **Resize**: 8 resize handles (edges + corners) → update width/height
- Minimum size: 300×200

### F4 — Alt+Arrow canvas pan
Global keydown listener on the canvas container:
- `Alt+ArrowLeft/Right/Up/Down` → pan canvas by 100px steps
- Smooth CSS transition on pan offset

### F5 — Radar minimap overlay
Small fixed overlay (220×160) in bottom-right corner showing:
- All panes as colored mini-rectangles (proportional positions)
- Current viewport rectangle (green outline)
- Click + drag inside radar → pan canvas to that position

### F6 — Workspace clone / paste
Right-click context menu on WorkspaceRail tab:
- "Clone Workspace" → deep-copies all panes with new IDs, new workspace name = "{original} copy"
- Cloned workspace auto-activates

---

## Architecture Changes

### `src/shared/contracts.ts`
Add geometry to `PaneStateBase`:
```ts
x: number
y: number
width: number
height: number
```
Add canvas offset to `WorkspaceState`:
```ts
canvasOffset: { x: number; y: number }
```

### `src/main/store/stateStore.ts`
- Default geometry assigned when creating panes (stagger offset: +30px per pane)
- New method: `cloneWorkspace(workspaceId): WorkspaceState`
- New method: `updatePaneGeometry(wsId, paneId, x, y, w, h)`
- New method: `setCanvasOffset(wsId, x, y)`
- Migration: inject default geometry into existing panes without it

### `src/main/index.ts` (IPC handlers)
- `state:cloneWorkspace` → cloneWorkspace()
- `state:updatePaneGeometry` → updatePaneGeometry()
- `state:setCanvasOffset` → setCanvasOffset()

### `src/preload/index.ts`
Expose new IPC methods on `window.ananke.state`:
- `cloneWorkspace(id)`
- `updatePaneGeometry(wsId, paneId, x, y, w, h)`
- `setCanvasOffset(wsId, x, y)`

### New renderer components
- `src/renderer/layout/CanvasWorkspace.tsx` — replaces PaneGrid
- `src/renderer/layout/FloatingPane.tsx` — draggable/resizable pane shell
- `src/renderer/layout/RadarMinimap.tsx` — minimap overlay

### `src/renderer/layout/WorkspaceRail.tsx`
- Add right-click context menu → "Clone Workspace"

### `src/renderer/app/App.tsx`
- Replace `<PaneGrid>` with `<CanvasWorkspace>`
- Pass `canvasOffset` + `onCanvasOffsetChange`
- Wire `Alt+Arrow` keyboard handler

---

## Implementation Steps (ordered)

### Step 1 — Contracts + Store (backend foundation)
1. Edit `contracts.ts`: add `x, y, width, height` to `PaneStateBase`, add `canvasOffset` to `WorkspaceState`
2. Edit `stateStore.ts`: 
   - Add default geometry to `addPane()`
   - Add `cloneWorkspace()`, `updatePaneGeometry()`, `setCanvasOffset()`
   - Migration: patch loaded state to inject geometry defaults

### Step 2 — IPC wiring
3. Edit `src/main/index.ts`: register 3 new IPC handlers
4. Edit `src/preload/index.ts`: expose 3 new methods on `window.ananke.state`

### Step 3 — FloatingPane component
5. Create `src/renderer/layout/FloatingPane.tsx`:
   - Title bar with drag-to-move
   - 8 resize handles
   - Calls `onGeometryChange(x, y, w, h)` on drag end (debounced)
   - Renders children inside

### Step 4 — CanvasWorkspace component
6. Create `src/renderer/layout/CanvasWorkspace.tsx`:
   - Outer container: `overflow: hidden`, full window size
   - Inner canvas div: `position: relative`, offset via CSS transform translate
   - Maps panes to `<FloatingPane>` wrappers
   - Handles Alt+Arrow pan via keyboard event
   - Exposes `setCanvasOffset` callback

### Step 5 — RadarMinimap component
7. Create `src/renderer/layout/RadarMinimap.tsx`:
   - Fixed 220×160px overlay in bottom-right
   - Renders proportional pane rects
   - Renders viewport rect
   - Click/drag pans canvas

### Step 6 — Clone Workspace UI
8. Edit `WorkspaceRail.tsx`: add right-click menu with "Clone" option

### Step 7 — App.tsx integration
9. Edit `App.tsx`:
   - Replace PaneGrid → CanvasWorkspace
   - Thread canvasOffset through state
   - Pass geometry update callbacks

### Step 8 — CSS
10. Add styles for FloatingPane, CanvasWorkspace, RadarMinimap

---

## Files to Create
- `src/renderer/layout/CanvasWorkspace.tsx`
- `src/renderer/layout/FloatingPane.tsx`
- `src/renderer/layout/RadarMinimap.tsx`

## Files to Modify
- `src/shared/contracts.ts`
- `src/main/store/stateStore.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/app/App.tsx`
- `src/renderer/layout/WorkspaceRail.tsx`
- `src/renderer/styles/global.css`
