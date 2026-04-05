# Codebase Concerns

**Analysis Date:** 2026-04-05

## Tech Debt

**DevTools Always Enabled:**
- Issue: Developer tools are unconditionally opened in production
- Files: `src/main/index.ts:365`
- Impact: Performance overhead, security exposure in built app, visual noise
- Fix approach: Conditionally enable devtools only when `NODE_ENV === 'development'` or via environment flag

**CSS Animation Bloat:**
- Issue: Multiple always-active animations causing continuous GPU/CPU use
- Files: `src/renderer/styles/global.css:297-304` (pulse-border), `493-500` (pulse-op)
- Impact: Battery drain, unnecessary repaints especially on `.pane-tile.attention` and `.file-row-calc-msg`
- Fix approach: Reduce animation frequency (increase duration), use `prefers-reduced-motion` media query, only animate when necessary

**String-Based Type Checks:**
- Issue: Pane type validation relies on string comparisons instead of type-safe enums/discriminators
- Files: `src/renderer/app/App.tsx:104-152` (repeated `pane.type === 'file-browser'` checks)
- Impact: Runtime errors if type string misspells, harder to refactor, no IDE navigation
- Fix approach: Use TypeScript type guards or tagged union pattern consistently

**Inline Event Listener Proliferation:**
- Issue: Global event listeners created dynamically without systematic cleanup patterns
- Files: `src/renderer/panes/file-browser/FileBrowserPane.tsx:113-125`, `127-222`, `224-250`, `251-268`
- Impact: Memory leaks risk, hard to debug listener interactions, multiple listeners for same event
- Fix approach: Consolidate listeners, create `useEventListener` custom hook with automatic cleanup

## Known Bugs

**Single File Operation Blocking:**
- Symptoms: Cannot start a new copy/move/delete operation while one is running; UI shows error "Another file operation is already in progress"
- Files: `src/main/jobs/fileJobManager.ts:50-52`
- Trigger: Start file operation while another is running
- Impact: User cannot queue operations or work with multiple file jobs
- Workaround: Wait for current job to complete
- Root cause: `FileJobManager` enforces `runningJobId !== null` check—architectural limitation of single-worker design

**Terminal Resize Race Condition:**
- Symptoms: PTY dimensions mismatch with xterm display, causing text rendering corruption when resizing quickly
- Files: `src/renderer/panes/terminal/useXterm.ts:54-69`
- Trigger: Rapidly resizing terminal pane while PTY resize is in flight
- Impact: Garbled output, cursor positioning errors
- Root cause: ResizeObserver can queue multiple resize requests before PTY resize completes; debounce uses `requestAnimationFrame` but PTY call is async
- Fix approach: Add additional debounce delay (150ms minimum) or queue resize requests

**Unsaved Editor Changes Not Detected:**
- Symptoms: User edits file in editor modal, closes without saving—changes are lost silently
- Files: `src/renderer/panes/file-browser/FileBrowserPane.tsx:456-493`
- Trigger: Click Cancel or press Escape without explicitly clicking Save
- Impact: Data loss without warning
- Root cause: Textarea uses `defaultValue` (no controlled state), no dirty flag tracking
- Fix approach: Track text changes, show confirmation dialog if dirty state exists on close

## Security Issues

**Browser Partition Naming Based on Pane ID:**
- Risk: paneId is a crypto.randomUUID() but partition names are deterministic per session; if attacker knows paneId they can predict partition path
- Files: `src/main/browser/browserPaneManager.ts:47` (`partition: persist:guest-${paneId}`)
- Current mitigation: Partition path is `persist:` scoped within Electron (not OS filesystem)
- Recommendation: Consider randomizing partition naming separately from paneId, or document partition isolation assumptions

**Private Mode Gaps in Browser History:**
- Risk: Browser pane history still recorded if `shouldRecord()` returns true before private mode is toggled mid-session
- Files: `src/main/browser/browserPaneManager.ts:21-29`, `src/main/index.ts:354`
- Current mitigation: `shouldRecord()` closure captures current settings
- Recommendation: Clear all in-memory histories when private mode is toggled, add state invalidation

**PTY Environment Inheritance:**
- Risk: Child PTY process inherits entire `process.env`, potentially exposing parent Node process secrets (SSH keys, tokens, etc.)
- Files: `src/main/pty/terminalManager.ts:28` (`env: process.env as Record<string, string>`)
- Current mitigation: None
- Recommendation: Filter PTY environment—whitelist safe vars only (PATH, HOME, USER, LANG, etc.), strip ELECTRON_*, NODE_*, and any _KEY/_TOKEN suffixed vars

**Path Validation in File Operations:**
- Risk: QuickOp delete/rename operations use `resolve()` but don't validate paths are within user's allowed directories
- Files: `src/main/index.ts:190-203` (fs:quickOp handler)
- Current mitigation: Archive unpack uses `safeJoin()` validation, but quickOp does not
- Recommendation: Apply same path safety checks to fs:quickOp before execution

## Performance Bottlenecks

**Folder Size Calculation Blocks UI:**
- Problem: `fs:getFolderSize` recursively walks entire directory tree synchronously in main thread
- Files: `src/main/index.ts:169-187`, triggered by `src/renderer/panes/file-browser/FileList.tsx:115`
- Cause: No cancellation token, no progress updates, entire tree must complete before response
- Impact: Main process blocks for large folders (100k+ files), UI freezes for 5-30+ seconds
- Improvement path: Move to worker thread, add cancellation support, stream progress updates

**Unvirtualized File Lists:**
- Problem: FileList renders all directory entries as DOM elements, even if 10,000+ files in directory
- Files: `src/renderer/panes/file-browser/FileList.tsx:137-163`
- Cause: `displayEntries.map()` renders every entry without virtualization
- Impact: Memory usage spikes, scrolling lag with large directories
- Improvement path: Implement react-window or custom virtual scrolling, lazy render

**Always-Active CSS Animations:**
- Problem: `.pane-tile.attention` has `animation: pulse-border 2s infinite` running on every "attention" pane
- Files: `src/renderer/styles/global.css:297-304`, `.file-row-calc-msg` has `animation: pulse-op 1.5s infinite` (line 493)
- Cause: No performance optimization, animations run continuously even when offscreen
- Impact: 60+ repaints/sec per animated element, noticeable power drain
- Improvement path: Use `animation-play-state: paused` when pane not visible, reduce frequency

**Full State Serialization on Every Pane Update:**
- Problem: Each pane state change serializes entire `AppStateSnapshot` (all workspaces, all panes, all history) to electron-store
- Files: `src/main/store/stateStore.ts:90-95` (setSnapshot), called on every pane interaction
- Cause: `structuredClone()` and JSON serialization in store write
- Impact: Write latency 50-200ms for large state trees, noticeable UI lag
- Improvement path: Implement incremental state persistence, batch writes, use `debounce` on state saves

## Fragile Areas

**Large FileBrowserPane Component:**
- Files: `src/renderer/panes/file-browser/FileBrowserPane.tsx` (496 lines)
- Why fragile:
  - Single component handles split layout, keyboard shortcuts, file operations, editor modal, archive dialog
  - 23 useState/useRef declarations tightly coupled
  - Event listener setup spread across 4 useEffect hooks
  - Complex pane update callbacks scattered throughout
- Safe modification: Extract editor modal to `<FileEditor />` component, extract archive dialog to `<ArchiveModal />`, create custom `useFileBrowserKeyboard` hook for keyboard handling
- Test coverage: No tests exist

**Complex App.tsx State Management:**
- Files: `src/renderer/app/App.tsx` (240 lines)
- Why fragile:
  - Single `snap` state drives all pane renders and callbacks
  - Callbacks are closure-bound to `ws` which can become stale
  - No loading state distinction (null snap could mean "loading" or "error")
  - setSnap() calls scattered across all pane event handlers
- Safe modification: Adopt Context API for state (AppState, AppActions), create `useAppState()` hook, add explicit loading/error states
- Test coverage: No tests exist

**Worker Threading Model - Single Worker, Single Job:**
- Files: `src/main/jobs/fileJobManager.ts`, `src/main/workers/fileOpsWorker.ts`
- Why fragile:
  - Only one file operation can run at a time (enforced by `runningJobId` check)
  - Worker is never reused—created on first job, terminated on cancel
  - Progress reporting has no cancellation support
  - Large file copy has no progress granularity (reports per-file only, not per-chunk)
- Safe modification: Create worker pool (2-4 workers), queue jobs, implement cancellation tokens with cleanup
- Test coverage: No tests exist

**PTY Manager Cleanup Timing:**
- Files: `src/main/pty/terminalManager.ts:58-72`
- Why fragile:
  - Manual setTimeout(300ms) for process cleanup is hardcoded and arbitrary
  - No error handling if process kill fails
  - Ctrl+D (EOF) write can throw silently
  - dispose() called from pane close event, but no guarantee pane manager is still alive
- Safe modification: Use `.kill('SIGTERM')` with timeout fallback to `SIGKILL`, add error event handlers
- Test coverage: No tests exist

## Missing Critical Features

**No Test Suite:**
- Symptom: Zero unit, integration, component, E2E, or security tests
- Impact: Refactoring risk, regression blindness, security assumptions untested
- Blocking: Bug fixes require manual QA; refactoring AppState/FileBrowserPane takes days with human testing
- Priority: **Critical** - must add test infrastructure before major refactors

**No Cancellation Support for File Operations:**
- Symptom: Cannot gracefully stop large copy operations mid-way
- Impact: Cancel terminates worker abruptly, destination may be partially written/corrupted
- Blocking: Cannot use app for large file transfers with interruption recovery
- Recommendation: Implement `AbortController` pattern, flush incomplete files on cancel

**No Progress Indication for Folder Size Calculation:**
- Symptom: UI freezes with no feedback during `getFolderSize`
- Impact: User thinks app crashed on large folders
- Recommendation: Stream progress updates, add cancellation token, show status in FileList

## Test Coverage Gaps

**No Component Tests:**
- What's not tested: FileBrowserPane, TerminalPane, FileList interactions, split pane resizing, keyboard shortcuts
- Files: `src/renderer/panes/**/*.tsx`
- Risk: Pane state updates could silently fail; splits could break
- Priority: **High**

**No Integration Tests:**
- What's not tested: File operations (copy/move/delete) workflows, terminal spawn/write/resize, browser navigation
- Files: `src/main/**/*.ts`, IPC handlers
- Risk: Silent state corruption, process leaks, file system inconsistencies
- Priority: **High**

**No Security Tests:**
- What's not tested: Path traversal in archive unpack, PTY environment filtering, browser partition isolation, unsafe archive member paths
- Files: `src/main/security/**`, `src/main/archive/**`, `src/main/pty/**`
- Risk: Path traversal RCE, env var leakage, partition name collisions
- Priority: **Critical**

**No E2E Tests:**
- What's not tested: Full user workflows (create workspace, open files, edit, copy/move, terminal commands)
- Risk: Electron app integration bugs go unnoticed (IPC, window lifecycle, preload)
- Priority: **Medium**

## Risky Dependencies

**node-pty - Native Module Risk:**
- Risk: Unmaintained compile flags, potential memory leaks in child processes, platform-specific crashes
- Version: `^1.0.0`
- Impact: Terminal panes crash on some systems, PTY process leaks not cleaned up
- Migration plan: Monitor @zellij-org/zellij-client or charybdis for alternatives; current node-pty maintenance is marginal
- Recommendation: Pin exact version, test thoroughly on macOS/Linux/Windows before upgrades

**@xterm/addon-webgl - GPU Rendering Fallback:**
- Risk: WebGL addon throws silently, DOM renderer is 3-5x slower
- Version: `^0.18.0`
- Impact: Terminal responsiveness degrades unpredictably on some GPUs
- Current mitigation: Try/catch wraps addon load (useXterm.ts:29-34)
- Recommendation: Add telemetry/logging to detect when WebGL fails, benchmark DOM renderer performance

**electron-store - Plaintext Storage:**
- Risk: All state stored plaintext in `~/.config/Ananke\ Commander/ananke-commander-state.json`
- Version: `^10.0.0`
- Impact: Sensitive URLs, paths, settings readable by any process on system
- Current mitigation: None
- Recommendation: Encrypt at rest using Keytar, store sensitive state separately

## Scaling Limits

**Single Workspace File Limit:**
- Current capacity: ~5-10k files before list becomes sluggish
- Limit: FileList DOM rendering caps out around 10k entries (unvirtualized)
- Scaling path: Implement react-window virtualization, add search/filter, pagination

**PTY Scrollback Memory:**
- Current capacity: 50,000 lines configurable (default ~1000)
- Limit: Large scrollback allocates significant memory (50k lines = ~5-10MB per terminal)
- Scaling path: Circular buffer in native module, or disk-backed history

**State Store Size:**
- Current capacity: electron-store handles 1-10MB JSON gracefully
- Limit: Very large recently-closed history (50+ panes * 100KB = 5MB+) causes serialization lag
- Scaling path: Implement incremental saves, compress history, move to indexed DB

---

*Concerns audit: 2026-04-05*
