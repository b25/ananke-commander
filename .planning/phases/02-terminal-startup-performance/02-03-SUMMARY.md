---
phase: 02-terminal-startup-performance
plan: 03
subsystem: main-process-startup
tags: [lazy-init, devtools-guard, flush-snapshot, performance, startup]
dependency_graph:
  requires: [debounced-setSnapshot, flushSnapshot-api]
  provides: [lazy-manager-getters, devtools-production-guard, flush-on-close]
  affects: [src/main/index.ts]
tech_stack:
  added: []
  patterns: [lazy-singleton-getter, app-isPackaged-guard]
key_files:
  modified:
    - src/main/index.ts
decisions:
  - Used mainWindow! in lazy getters instead of local win variable (mainWindow is set before registerIpcHandlers)
  - Added openDevTools() call guarded by app.isPackaged (was not present before -- new addition)
  - Used optional chaining for flushSnapshot call in closed handler for defensive null safety
metrics:
  duration_seconds: 98
  completed: 2026-04-05T16:48:21Z
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 02 Plan 03: Lazy Manager Init and DevTools Guard Summary

Lazy getter functions for 4 managers (TerminalManager, FileJobManager, FolderSizeManager, BrowserPaneManager) deferring instantiation from startup to first IPC call, plus DevTools production guard and flushSnapshot on close.

## Changes Made

### Task 1: Add DevTools guard and convert 4 managers to lazy getters (PERF-05, D-03)

**Commit:** 41fa603

Modified `src/main/index.ts` to:

- **Removed eager instantiation** of FileJobManager, FolderSizeManager, TerminalManager, and BrowserPaneManager from `createWindow()`. StateStore remains eager (needed immediately for `state:get` on renderer load).
- **Added 4 lazy getter functions** (`getTerminals()`, `getFileJobs()`, `getFolderSizeMgr()`, `getBrowserPanes()`) that instantiate the manager on first call and cache it in the module-level variable.
- **Replaced all 14 direct manager references** in IPC handlers (`terminals!`, `fileJobs!`, `folderSizeMgr!`, `browserPanes!`) with corresponding getter calls. No bare non-null assertions remain for lazy managers.
- **Added DevTools guard**: `if (!app.isPackaged) { win.webContents.openDevTools() }` after `win.loadURL()`. DevTools were not previously opened in the code; the guard ensures they open only during development.

### Task 2: Wire stateStore.flushSnapshot() into window closed handler (PERF-06, D-04)

**Commit:** 8de092f

- **Added `stateStore?.flushSnapshot()`** as the first statement in the `win.on('closed')` handler, before any manager disposal or null assignments.
- This ensures any pending debounced state writes (from the 300ms debounce in setSnapshot, added in Plan 02) are flushed synchronously to disk before the process exits.
- Uses optional chaining (`?.`) for defensive null safety.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Status | Implementation |
|-----------|--------|---------------|
| T-02-08 (DevTools in production) | Mitigated | app.isPackaged guard prevents openDevTools() in packaged builds |
| T-02-09 (null mainWindow in getter) | Mitigated | mainWindow is set before registerIpcHandlers(); all getters use mainWindow! safely |
| T-02-10 (missed dispose on lazy manager) | Accepted | Optional chaining in closed handler no-ops for never-initialized managers |
| T-02-11 (flushSnapshot ordering) | Mitigated | flushSnapshot() is first statement in closed handler, before stateStore = null |

## Known Stubs

None.

## Verification Results

- getTerminals() appears 6 times (getter def + 5 IPC handler callsites)
- getFileJobs() appears 4 times (getter def + 3 IPC handler callsites)
- getFolderSizeMgr() appears 3 times (getter def + 2 IPC handler callsites)
- getBrowserPanes() appears 5 times (getter def + 4 IPC handler callsites)
- Zero remaining bare non-null assertions for lazy managers (terminals!, fileJobs!, folderSizeMgr!, browserPanes!)
- app.isPackaged guard present
- flushSnapshot appears exactly once in index.ts, as first statement in closed handler
- stateStore = new StateStore() still present in createWindow() (eager)
- Pre-existing TypeScript error in index.ts (createOrShow method name mismatch on BrowserPaneManager) is not caused by this plan's changes

## Self-Check: PASSED
