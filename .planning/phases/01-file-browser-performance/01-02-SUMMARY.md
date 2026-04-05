---
phase: 01-file-browser-performance
plan: 02
subsystem: file-browser
tags: [streaming, folder-size, web-worker, ipc, performance]
dependency_graph:
  requires: [virtualized-file-list]
  provides: [streaming-folder-size, folder-size-worker, folder-size-ipc]
  affects: [FileList.tsx, contracts.ts, main/index.ts, preload/index.ts]
tech_stack:
  added: []
  patterns: [worker-threads, web-worker-throttle, ipc-streaming, cancel-on-navigation]
key_files:
  created:
    - src/main/workers/folderSizeWorker.ts
    - src/main/jobs/folderSizeManager.ts
    - src/renderer/panes/file-browser/folderSizeAccumulator.ts
    - src/renderer/panes/file-browser/useFolderSize.ts
  modified:
    - src/shared/contracts.ts
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/panes/file-browser/FileList.tsx
decisions:
  - "Used Map<requestId, boolean> for cancel tracking in worker instead of AbortController (simpler for multi-request)"
  - "Web Worker accumulator throttles at 100ms intervals to prevent React render flooding"
  - "FolderSizeManager supports concurrent requests unlike FileJobManager single-job model"
metrics:
  duration: 207s
  completed: "2026-04-05T15:18:21Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 01 Plan 02: Streaming Folder Size Calculation Summary

Streaming folder size with main-process worker thread walking directories, IPC progress streaming, renderer Web Worker throttling updates at 100ms, and useFolderSize hook with cancel-on-navigation and per-visit caching.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 9e782f6 | Add IPC streaming pipeline for folder size calculation |
| 2 | 460bfa7 | Add renderer-side folder size streaming with Web Worker throttling |

## What Was Done

### Task 1: IPC Contracts, Main-Process Worker, Manager, and Preload API

- Added `FolderSizeRequest`, `FolderSizeProgress`, `FolderSizeDone`, `FolderSizeError` types to `contracts.ts`
- Created `folderSizeWorker.ts` -- walks directory tree recursively via `readdir`+`stat`, streams progress every 50 files or 100ms, supports cancel messages via requestId Map, skips permission errors
- Created `FolderSizeManager` -- manages worker lifecycle, supports multiple concurrent folder size requests, bridges worker messages to IPC sends on `webContents`
- Registered `fs:startFolderSize` and `fs:cancelFolderSize` IPC handlers in `main/index.ts` with `resolve(dirPath)` for path normalization (T-01-03 mitigation)
- Added `startFolderSize`, `cancelFolderSize`, `onFolderSizeProgress`, `onFolderSizeDone`, `onFolderSizeError` to preload `fs` namespace with cleanup return functions
- Added `folderSizeMgr.dispose()` in window close handler

### Task 2: Renderer Web Worker, useFolderSize Hook, FileList Integration

- Created `folderSizeAccumulator.ts` renderer-side Web Worker that receives forwarded IPC events, accumulates running totals, and posts throttled updates (100ms) back to the hook (T-01-06 mitigation)
- Created `useFolderSize` hook managing full lifecycle: IPC listener setup/teardown, Web Worker creation/termination, cancel-on-navigation (D-07), duplicate-request prevention (D-07), per-visit caching (D-10)
- Integrated into `FileList.tsx`: Space key on focused directory triggers `startCalculation` (D-05 opt-in), size column renders folder size states via `renderFolderSize` helper
- Size states: `idle` (empty), `calculating` (pulsing bar via `size-calculating` CSS), `streaming` (accent italic running total via `size-streaming` CSS), `done` (final formatted size), `error` (dashes)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None. All functionality is wired end-to-end: Space key -> IPC -> worker thread -> progress streaming -> Web Worker throttle -> React state -> UI rendering.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-01-03 | `resolve(dirPath)` applied in IPC handler before passing to worker |
| T-01-04 | Cancel messages supported; worker throttles progress to every 50 files/100ms |
| T-01-06 | Renderer Web Worker throttles updates to 100ms; reset message clears state on navigation |

## Verification

- `npm run typecheck` produces no new errors (12 pre-existing errors unrelated to this plan)
- No errors in `contracts.ts`, `folderSizeWorker.ts`, `folderSizeManager.ts`, `useFolderSize.ts`, `folderSizeAccumulator.ts`, or `FileList.tsx`
- All acceptance criteria from both tasks satisfied

## Self-Check: PASSED

All 8 key files verified on disk. Both commit hashes (9e782f6, 460bfa7) verified in git log.
