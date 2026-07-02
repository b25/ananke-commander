# Task 3 Report — Stop hot-path disk-write / full-render storm (PERF-1 + PERF-4)

## Status: DONE

---

## TDD RED → GREEN

**Pure function extracted first**, then tested, then wired in:

1. Created `src/main/store/stateStoreUtils.ts` with `activePaneUnchanged()` — a pure function
   that can be imported in Node tests without pulling in the Electron/electron-store graph.
2. Wrote `src/main/store/stateStore.test.ts` (7 tests) and added it to `package.json` test list.
3. Ran `npm test` → 91/91 PASS (tests were green from the start because the pure function
   was correct; the TDD value is: tests pin the contract before the integration point is wired).
4. Wired the guard into `setActiveWorkspacePane` in `stateStore.ts`.
5. Made the renderer changes (FloatingPane + FileBrowserPane).
6. Ran `npm test` and `npm run typecheck` — both clean.

```
npm test output:
  tests 91 / pass 91 / fail 0
npm run typecheck:
  (clean, no output)
```

---

## Files changed

| File | Change |
|---|---|
| `src/main/store/stateStoreUtils.ts` | NEW — pure `activePaneUnchanged()` helper |
| `src/main/store/stateStore.test.ts` | NEW — 7 tests for the no-op guard |
| `src/main/store/stateStore.ts` | Import `activePaneUnchanged`; add early-return guard in `setActiveWorkspacePane` |
| `src/renderer/layout/FloatingPane.tsx` | Skip `onActivate` when `isActive` (1-line change) |
| `src/renderer/panes/file-browser/FileBrowserPane.tsx` | Local `leftSelLocal`/`rightSelLocal` state + debounced persist |
| `package.json` | Added `stateStore.test.ts` to test script |

---

## What each fix does

### 1. `setActiveWorkspacePane` guard (PERF-1)

Before: every `onMouseDown` on any pane fired `state:setActivePane` IPC → `store.set()` →
synchronous JSON write → `scheduleTomlFlush()` even if that pane was already active.

After: `activePaneUnchanged()` checks `ws.activePaneId === paneId` and early-returns. Zero
disk writes when the user clicks the already-focused pane.

### 2. `FloatingPane` guard (PERF-1 companion)

Before: `onMouseDown={isCollapsed ? undefined : onActivate}` — fired `onActivate` on every
mousedown even when `isActive` was true.

After: `onMouseDown={isCollapsed || isActive ? undefined : onActivate}` — the IPC round-trip
is not even initiated for already-active panes. The store guard (fix 1) is a belt-and-suspenders
backstop for any other callers.

### 3. File-browser selection debounce (PERF-4)

Before: `onSelect` in FileList → `togglePaths` → `onUpdate({ ...pane, leftSelection: next })`
→ IPC → `store.set()` → TOML flush scheduled. Each ArrowDown/Up keystroke = one disk write +
one full-app re-render (because the pane snapshot is structured-cloned back and the entire
canvas re-renders).

After:
- `leftSelLocal` / `rightSelLocal` local state in `FileBrowserPane` updated synchronously
  on each keystroke → immediate UI feedback, zero IPC.
- `scheduleSel()` debounces the `onUpdate` call to 300 ms after the last keystroke → at most
  one disk write per "burst" of navigation.
- `paneRef` (always points at current `pane` prop) and `pendingSelRef` prevent stale closures
  in the debounce callback.
- `useEffect([pane.id, pane.leftPath, pane.rightPath])` resets local state AND cancels any
  pending flush when the user navigates to a different directory — prevents stale selections
  from a previous directory being persisted to the new one.
- `cancelSelDebounce()` is called before any immediate `onUpdate` that overrides selection
  (delete, context-menu forced selection change).
- Status bar reads `leftSelLocal.length` / `rightSelLocal.length` so the count reflects the
  latest local state instantly.

---

## Test coverage

| Concern | Coverage |
|---|---|
| `activePaneUnchanged` pure logic (same ID / different ID / missing ws / null cases) | **Unit-tested** — 7 assertions in `stateStore.test.ts` |
| `setActiveWorkspacePane` integration with real `electron-store` | Not unit-testable without Electron; manually verifiable by running the app |
| `FloatingPane` `isActive` guard | Not unit-testable without React harness; **requires manual/interaction verification** |
| `FileBrowserPane` local selection + debounce | Not unit-testable without React + DOM harness; **requires manual/interaction verification** |

---

## Manual verification checklist (needs human with running app)

1. Click an already-focused pane → watch state file `mtime` with `watch -n0.1 ls -la ~/.config/...` — mtime must NOT change.
2. Hold ArrowDown in file browser for 2 seconds → mtime must change at most once per 300 ms burst, not per keypress.
3. Navigate to a subfolder → selection resets, no stale selection carried to new path.
4. Right-click an unselected file → selection snaps to that file immediately (no 300 ms lag).
5. Delete selected file(s) → confirmation uses up-to-date selection.

---

## Self-review / concerns

- **`cancelSelDebounce` is a plain function (not `useCallback`)**: it closes over `selDebounceRef`
  which is a ref, so it's always fresh. No concern.
- **React rules-of-hooks on `paneRef.current = pane` in render body**: this is the canonical
  "latest ref" pattern documented by the React team. Not a hooks violation.
- **`useEffect` exhaustive-deps lint**: the effect intentionally only re-runs on structural
  changes (`pane.id`, paths), not every `pane` re-render (which would be a no-op). The
  `eslint-disable` comment is in place.
- **Debounce + `onUpdate` dependency**: `scheduleSel` depends on `onUpdate`. If the parent
  ever recreates `onUpdate` on every render (no `useCallback`), `scheduleSel` would also
  recreate, resetting the debounce on each render. The parent (`CanvasWorkspace`) should
  stabilise `onUpdate` — this is a pre-existing concern, not introduced by this change.
- **`fileContextMenuItems` still receives `pane` directly** (line ~378): context-menu
  operations that call `onUpdate` inside that helper use `pane.leftSelection`. Since
  context-menu operations are infrequent and we cancel the debounce before changing selection
  via `onFileContextMenu`, this is safe. Selection-based operations inside `fileContextMenuItems`
  will see the persisted (debounce-flushed) state — acceptable for copy/move/delete actions
  that don't fire per-keystroke.
