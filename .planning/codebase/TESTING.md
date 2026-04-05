# Testing — Ananke Commander

## Current State: No Tests

The codebase has **zero automated test coverage**. No test files, no test framework, no test scripts.

### What's Missing
- No `.test.ts` / `.spec.ts` files anywhere in `src/`
- No Jest, Vitest, or any other test runner in `package.json`
- No test-related npm scripts (`test`, `test:watch`, `test:coverage`)
- No E2E framework (Playwright, Spectron, etc.)
- No CI pipeline running tests

## Risk Areas (Untested)
- IPC contract between main and renderer (`src/shared/contracts.ts`) — type-safe at compile time only, no runtime validation tests
- `FileJobManager` worker thread orchestration — concurrent file operation logic is complex and untested
- `TerminalManager` PTY lifecycle (create, resize, destroy) — platform-specific behavior unverified
- `StateStore` persistence and migration — no tests for electron-store read/write or schema migration
- `BrowserPaneManager` WebContentsView isolation — session/partition logic untested
- React pane components — no component tests (no React Testing Library setup)

## Recommended Test Strategy (for future work)
| Layer | Framework | What to test |
|-------|-----------|--------------|
| Unit | Vitest | FileJobManager, TerminalManager, StateStore logic |
| IPC Contract | Vitest | contracts.ts type guards, IPC handler return shapes |
| Component | Vitest + React Testing Library | Pane components, WorkspaceRail |
| Integration | Vitest | Main process manager interactions |
| E2E | Playwright (electron) | Full app flows: open file, run terminal cmd, browse URL |

## Notes
- Electron apps require special test setup for main process (mocking `ipcMain`, `BrowserWindow`)
- Worker thread tests need careful teardown to avoid leaked threads
- PTY tests are platform-sensitive — CI must match target OS
