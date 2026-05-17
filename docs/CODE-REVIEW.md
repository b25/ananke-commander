# Code Review - Deep Audit

## Executive Summary

Scope covered:
- Electron main process and protocol/security surfaces
- Preload/IPC exposure patterns
- Renderer shell/layout and pane modules (file browser, terminal, notes, browser)
- API toolkit (HTTP/gRPC/mock/history/store)

Key outcomes:
- Security-critical gaps exist in `app://` path handling and browser policy drift.
- Multiple high-severity correctness bugs affect terminal lifecycle, notes undo/sync, file-browser interactions, and API-toolkit behavior.
- Performance risks are concentrated in recursive JSON rendering, unbounded HAR growth, and frequent persistence in hot paths.
- The architecture is functional but has high coupling in several large modules.

## Critical / Security Findings

| Severity | Finding | Evidence | Recommended fix |
|---|---|---|---|
| Critical | `app://` protocol path containment can escape renderer dir | `src/main/protocol/registerAppProtocol.ts` uses `normalize(pathname)` then `join(rendererDir, safe)` at lines 56-57; no post-join containment check | Build with `resolve(rendererDir, safeRelative)` and reject if outside renderer root |
| High | Browser allowlist is dead code; policy currently allows all HTTP(S) | `TRUSTED_HOSTS` is defined but never used, and `isNavigationAllowed` returns `true` for all `http/https` at lines 3-22 in `src/main/security/browserSecurity.ts` | Either enforce host allowlist or remove dead config and align docs/UI with permissive behavior |
| High | Notes vault path is not containment-checked | `readVaultNote` / `deleteVaultNote` join raw `filename` at lines 46-66 in `src/main/notes/notesService.ts` | Validate/sanitize file names and enforce resolved path is inside vault root |
| High | Renderer can request arbitrary PTY command execution | `pty:spawn` passes `cmd/args` from IPC (line 310-311 in `src/main/index.ts`) to `pty.spawn` (line 78-96 in `src/main/pty/terminalManager.ts`) | Restrict commands in production builds or apply allowlisted command profiles |
| Medium | Guest browser DevTools is exposed without packaged-app guard | `browser:openDevTools` directly invokes manager at lines 389-391 in `src/main/index.ts` | Gate behind dev flag or `!app.isPackaged` |

## High-Severity Correctness Bugs

| Severity | Finding | Evidence | Recommended fix |
|---|---|---|---|
| High | `fs:writeUtf8` path handling is inconsistent with `fs:readUtf8` | `readUtf8` resolves path (197-199), but `writeUtf8` writes raw input path (202-205) in `src/main/index.ts` | Resolve `filePath` before mkdir/write and apply same normalization strategy across fs handlers |
| High | `fs:rename` also skips normalization/resolve | `rename(oldPath, newPath)` at lines 512-515 in `src/main/index.ts` | Resolve/normalize both paths before rename |
| High | `useXterm` can reuse stale PTY on lifecycle re-init | `spawnedPanes` guard in `doSpawnIfNeeded` (132-136) with cleanup not clearing set (158-174) in `src/renderer/panes/terminal/useXterm.ts` | Clear pane tracking on teardown/re-init and define explicit respawn policy |
| High | Notes undo stack uses stale source and can desync editor state | `undoStack` pushes `pane.body` (123-127), undo updates parent only (221-227), sync effect only on `pane.id` (36) in `src/renderer/panes/notes/NotesPane.tsx` | Push previous `localBody`, apply `setLocalBody` on undo, sync on body/title changes with dirty-state guard |
| High | App performs side-effectful IPC during render | `setActiveWorkspace` called in render branch at lines 102-103 in `src/renderer/app/App.tsx` | Move reconciliation to `useEffect` with guard/ref |
| High | Async state updates can race during workspace transitions | asynchronous prune/canvas effects call `setSnap` without sequence guards at lines 151-165 and 172-181 in `src/renderer/app/App.tsx` | Add request sequencing or cancellation guards before committing async results |
| High | File browser context menu acts on focused side, not clicked side | `onFileContextMenu` derives `side = pane.focusedSide` (251-266) in `src/renderer/panes/file-browser/FileBrowserPane.tsx` | Pass explicit side from `FileList` callbacks and use that for selection/context |
| High | Empty-directory keyboard navigation can access invalid indices | uses `displayEntries[nextIdx]` / `[0]` / `[lastIdx]` without empty guard at lines 156-221 in `src/renderer/panes/file-browser/FileList.tsx` | Short-circuit key handlers when `displayEntries.length === 0` |
| Medium | Ctrl/Cmd click does not toggle selected row off | additive branch always calls `onSelect([entry.path], true)` at lines 280-283 in `src/renderer/panes/file-browser/FileList.tsx` | Implement toggle semantics when entry already selected |
| High | Archive unpack default target can silently resolve to process cwd | `targetDir || '.'` at line 74 in `src/renderer/panes/file-browser/ArchiveDialog.tsx` | Require explicit target or default to active pane path |
| Medium | File editor can close without dirty-check and save uses DOM query | backdrop closes immediately (13-14) and save reads DOM by id (47-49) in `src/renderer/panes/file-browser/FileEditor.tsx` | Make editor controlled, track dirty state, prompt on dismiss |
| High | API toolkit history persistence does not update in-memory list | sends via storage (104-112) without store append in `src/renderer/api-toolkit/components/RequestEditor.tsx` | Update zustand history slice after successful send |
| High | gRPC stream cleanup depends on stale `tab.grpcStreamActive`; stream send skips resolved vars | cleanup uses `[tab.id]` only (42-49), streamStart sends `tab.grpcRequest.messageJson` (92) in `src/renderer/api-toolkit/components/GrpcPanel.tsx` | Cancel unconditionally on unmount or track latest active state via ref; send `resolvedReq.messageJson` |
| High | gRPC proto cache key can collide for text mode | `text:${s.content.slice(0, 64)}` in `sourceKey` (32-37) in `src/main/api-toolkit/grpc-engine.ts` | Use content hash-based key; add bounded cache policy |
| Medium | Cache invalidation hook exists but is not integrated | `invalidateCache` exported (83-87) in `src/main/api-toolkit/grpc-engine.ts` | Wire invalidation on source changes / rediscovery |
| High | HTTP body mode handling is incomplete and response buffering is unbounded | body switch falls back to raw default (62-75), full `arrayBuffer()` read (110) in `src/main/api-toolkit/http-client.ts` | Implement all declared body modes and add response-size guard/truncation/streaming |
| Medium | Folder-size cancel path does not emit terminal status from worker | cancel path sets flag (59-61), done/error only emitted when not cancelled (79-96) in `src/main/workers/folderSizeWorker.ts`; manager expects done/error to clear observability (33-47) in `src/main/jobs/folderSizeManager.ts` | Emit explicit cancelled message and handle it in manager/UI |

## Performance Issues

| Severity | Finding | Evidence | Recommended fix |
|---|---|---|---|
| High | Recursive JSON renderer builds full tree with no virtualization/lazy expansion | `JsonTree` recursion/map over full arrays/objects at lines 266-311 in `src/renderer/api-toolkit/components/ResponseViewer.tsx` | Add collapsible nodes + viewport virtualization for large payloads |
| Medium | Mock route hit persistence writes to disk on every hit | `updateRouteHitCount` persists in-line at lines 325-333 in `src/renderer/api-toolkit/store/index.ts` | Debounce or batch persistence |
| Medium | HAR capture grows unbounded in memory | `entries` array and push path at lines 43-45 and 191 in `src/main/browser/harCapture.ts` | Cap entries, rotate, or stream to disk |
| Medium | Directory listing/search perform broad parallel `stat` with no limit | `Promise.allSettled(entries.map(stat))` in `fs:listDir` (207-223) and recursive stat in `fs:findFiles` (254-284) in `src/main/index.ts` | Add bounded concurrency and cancellation support |

## UX and Accessibility Gaps

### File Browser
- Context behavior is inconsistent because right-click targets focused side logic (`src/renderer/panes/file-browser/FileBrowserPane.tsx`).
- Empty list keyboard behavior has invalid-index path (`src/renderer/panes/file-browser/FileList.tsx`).
- Multi-select UX lacks toggle-off behavior on Ctrl/Cmd click (`src/renderer/panes/file-browser/FileList.tsx`).
- Archive unpack default destination is unsafe/unpredictable (`src/renderer/panes/file-browser/ArchiveDialog.tsx`).
- File editor lacks dirty-dismiss safety (`src/renderer/panes/file-browser/FileEditor.tsx`).

### Terminal / Notes
- Terminal lifecycle settings (`fontSize`, `fontFamily`) are not re-applied after mount because init effect depends on `[paneId, cwd]` only (`src/renderer/panes/terminal/useXterm.ts`).
- Notes editor state sync and undo behavior are unreliable (`src/renderer/panes/notes/NotesPane.tsx`).

### API Toolkit
- History pane can appear stale after request send (`src/renderer/api-toolkit/components/RequestEditor.tsx`).
- gRPC stream lifecycle and variable substitution inconsistencies (`src/renderer/api-toolkit/components/GrpcPanel.tsx`).
- Large-response experience degrades due to eager full-tree rendering (`src/renderer/api-toolkit/components/ResponseViewer.tsx`).

## Modularity and Separation

- `src/main/index.ts` centralizes many IPC handlers in one file/function; this increases review/testing surface and coupling.
- `src/renderer/app/App.tsx` mixes reconciliation, layout policy, and render concerns.
- `src/renderer/panes/file-browser/FileBrowserPane.tsx` is a high-density orchestration component that combines selection, dialogs, context actions, jobs, and navigation.
- API toolkit domain logic is split reasonably between main/renderer, but key reliability paths (history sync, stream lifecycle, cache policy) need dedicated service hooks.

## Missing Functions / Feature Gaps

Priority gaps observed across modules:
- Browser security policy management UI (if allowlist model is desired).
- Stronger file-browser ergonomics (safe defaults, selection parity, robust empty-state behavior).
- API toolkit resilience for large payloads and rich request body modes.
- Automated regression coverage for critical IPC/pane lifecycle paths.

## Out of Scope

This audit did not include:
- Dependency vulnerability scanning (`npm audit`, SCA tools).
- Runtime profiling / tracing on live workloads.
- Packaging/signing pipeline hardening.
- Pixel-level visual QA.

## Methodology

- Performed read-only static audit across main/preload/renderer modules.
- Parallel deep exploration used to broaden coverage, then findings were manually spot-verified in source before inclusion.
- Included only findings with directly verifiable file/line evidence in this document.
