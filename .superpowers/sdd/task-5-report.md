# Task 5 Report — Suspend browser views when any modal opens (UX-2)

## Event contract matched

Listener in `src/renderer/panes/browser/BrowserPlaceholderPane.tsx` (~line 226-229):
```ts
window.addEventListener('ananke:modal-open',  () => window.ananke.browser.suspend(pane.id))
window.addEventListener('ananke:modal-close', () => scheduleSync())
```

- **`ananke:modal-open`** (plain `Event`, no detail payload) → suspends (moves off-screen) the native `WebContentsView` for every registered browser pane.
- **`ananke:modal-close`** (plain `Event`, no detail payload) → calls `scheduleSync()` which syncs the view back to its DOM placeholder bounds.

The hook dispatches exactly these two events with `new Event(...)` (no CustomEvent detail needed — the listener is identity-based, not data-based).

## Files changed

| File | Change |
|------|--------|
| `src/renderer/lib/useModal.ts` | **Created** — single-purpose hook dispatching `ananke:modal-open` on mount and `ananke:modal-close` on unmount |
| `src/renderer/panes/file-browser/InlinePromptDialog.tsx` | Added `useModal()` call; removed ad-hoc `useEffect` from `FileBrowserPane` (single source of truth) |
| `src/renderer/panes/file-browser/FileBrowserPane.tsx` | Removed the 4-line ad-hoc `useEffect` that dispatched `ananke:modal-open/close` based on `inlinePrompt` state — replaced by `useModal()` inside `InlinePromptDialog` |
| `src/renderer/panes/file-browser/CopyMoveDialog.tsx` | Added `useModal()` |
| `src/renderer/panes/file-browser/ArchiveDialog.tsx` | Added `useModal()` |
| `src/renderer/panes/file-browser/FileEditor.tsx` | Added `useModal()` |

## Test / typecheck output

```
npm test:       91 pass / 0 fail / 0 skipped  (duration ~200ms)
npm run typecheck: exit 0, no errors
```

## Manual verification steps

1. Launch the app (`npm run dev` or built Electron binary).
2. Add a Browser pane (e.g., navigate to https://example.com). Confirm the web page renders normally.
3. Add a File Browser pane alongside. Confirm browser view is visible and the file browser is usable.
4. **CopyMoveDialog**: Select one or more files, press F5 (Copy) or F6 (Move). The Copy/Move dialog must appear fully visible, centered over the layout. The browser pane content should vanish off-screen (native view suspended). Cancel/Confirm → browser pane restores.
5. **ArchiveDialog**: Select files, press the Archive toolbar button. Same behavior — dialog fully visible, browser pane offscreen; close → restores.
6. **FileEditor**: Select a text file, press F3 (view) or F4 (edit). Editor modal fully visible; close → browser restores.
7. **InlinePromptDialog**: Press F7 (new folder). Prompt dialog fully visible; cancel → browser restores.
8. Verify no event storm: rapidly opening and closing modals should not leave the browser view suspended indefinitely. Because `useModal` always pairs one open+close in a single effect (mount/unmount), stacking cannot occur.

## Self-review

- The hook is 10 lines, single-purpose, zero dependencies beyond React's `useEffect`. No risk of import cycles.
- `ArchiveDialog` is rendered via `createPortal` from `FileBrowserPane` (not self-portalled), but `useModal()` fires on component mount regardless of portal context — correct behavior.
- `FileEditor` is rendered conditionally via `editorState` state (not portalled). `useModal()` fires on mount/unmount of the component — correct.
- The removed `useEffect` in `FileBrowserPane` dispatched on every `inlinePrompt` state change (open → modal-open, close → modal-close); `useModal()` inside `InlinePromptDialog` does the same but scoped to the component lifecycle. Semantically identical, cleaner.
- All four modal components now participate in the suspend/restore cycle. Any future modal component that renders `.modal-backdrop` just needs one `useModal()` call.

## Concerns

- `ArchiveDialog` still uses `window.confirm()` for the "overwrite?" confirmation (line 74). This is a separate issue (the always-professional-dialogs standing rule) but out of scope for this task.
- `FileEditor` and `ArchiveDialog` use `window.confirm()` for unsaved-changes / overwrite guards. These native dialogs pause the renderer but do not trigger `ananke:modal-close` early — the browser pane stays suspended during the `confirm()` call, which is correct (modal is still "open").
- If two modals are ever open simultaneously (not currently possible in the UI), each dispatches its own open/close pair. The listener calls `suspend()` twice (idempotent) and `scheduleSync()` on the first close even if a second modal is still open. This edge case does not apply to the current codebase but could be addressed with a ref-counted guard if needed in the future.
