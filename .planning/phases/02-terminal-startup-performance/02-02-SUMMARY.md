---
phase: 02-terminal-startup-performance
plan: 02
subsystem: state-store
tags: [debounce, electron-store, performance, state-management]
dependency_graph:
  requires: []
  provides: [debounced-setSnapshot, flushSnapshot-api]
  affects: [src/main/store/stateStore.ts]
tech_stack:
  added: []
  patterns: [debounce-accumulator, pending-patch-merge]
key_files:
  modified:
    - src/main/store/stateStore.ts
decisions:
  - Used native setTimeout instead of lodash debounce to avoid new dependency (per D-04)
  - pendingPatch merged via spread in getSnapshot to prevent stale reads during debounce window
metrics:
  duration_seconds: 59
  completed: 2026-04-05T16:43:36Z
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 02 Plan 02: Debounce State Store Writes Summary

Debounced electron-store setSnapshot with 300ms pendingPatch accumulator, eliminating write storms from rapid pane interactions while keeping reads fresh via in-memory merge.

## Changes Made

### Task 1: Add pendingPatch debounce to StateStore.setSnapshot and fix getSnapshot stale-read

**Commit:** e18469b

Added debounce infrastructure to `StateStore` in `src/main/store/stateStore.ts`:

- **Two new private fields:** `pendingPatch: Partial<AppStateSnapshot>` accumulates patches in memory; `debounceTimer` tracks the 300ms flush timeout.
- **Replaced `setSnapshot`:** Now calls `Object.assign(this.pendingPatch, patch)` to accumulate, clears any existing timer, and schedules `flushSnapshot()` after 300ms of inactivity. Rapid successive calls (e.g., 50 in 300ms) result in a single disk write.
- **New public `flushSnapshot()` method:** Clears the timer, swaps out the pending patch, and writes each non-undefined key to electron-store. Designed for Plan 03 to call on window close to prevent state loss.
- **Updated `getSnapshot()`:** Reads from disk then spreads `pendingPatch` over the result, ensuring callers always see the latest in-memory state even during the debounce window.
- **No other methods changed:** `updateSettings`, `pushRecentlyClosed`, `updatePane`, etc. continue to call `this.store.set()` directly per decision D-04.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Status | Implementation |
|-----------|--------|---------------|
| T-02-05 (timer leak) | Mitigated | flushSnapshot() clears debounceTimer before flushing; no-op when pendingPatch is empty |
| T-02-06 (stale state read) | Mitigated | getSnapshot merges pendingPatch over disk values via spread |
| T-02-07 (state loss on quit) | Partial | flushSnapshot() is public and ready; Plan 03 will wire it into window close handler |

## Known Stubs

None.

## Verification Results

- All acceptance criteria grep patterns match
- No TypeScript errors in stateStore.ts (pre-existing errors in unrelated files are out of scope)
- No new imports added
- flushSnapshot is public and callable from external modules

## Self-Check: PASSED
