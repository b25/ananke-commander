# Architecture — Ananke Commander

## Pattern: Electron Multi-Process

Ananke Commander follows the standard Electron architecture with strict process isolation:

```
┌─────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                  │
│  src/main/index.ts                                       │
│                                                          │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  StateStore   │  │TerminalMgr   │  │BrowserPane   │ │
│  │ (electron-    │  │ (node-pty)   │  │Manager       │ │
│  │  store)       │  │              │  │(WebContents  │ │
│  └───────────────┘  └──────────────┘  │ View)        │ │
│  ┌───────────────┐  ┌──────────────┐  └──────────────┘ │
│  │ FileJobMgr    │  │ArchiveService│                    │
│  │ (workers)     │  │              │                    │
│  └───────────────┘  └──────────────┘                    │
│                          IPC                             │
├─────────────────────────────────────────────────────────┤
│  Preload (contextBridge)                                 │
│  src/preload/index.ts                                    │
│  exposes: window.electronAPI                             │
├─────────────────────────────────────────────────────────┤
│  Renderer Process (Chromium + React)                     │
│  src/renderer/main.tsx → App.tsx                         │
│                                                          │
│  WorkspaceRail → PaneGrid → [Pane Components]            │
└─────────────────────────────────────────────────────────┘
```

## Process Boundaries

### Main Process (`src/main/`)
Entry point: `src/main/index.ts` — creates `BrowserWindow`, registers IPC handlers, initializes managers.

**Managers:**
- `src/main/store/stateStore.ts` — Persists app state via `electron-store`. Single source of truth for workspace layout, pane config, settings.
- `src/main/pty/terminalManager.ts` — Wraps `node-pty` for terminal sessions. Manages PTY lifecycle (spawn, resize, destroy). Streams data to renderer via IPC events.
- `src/main/jobs/fileJobManager.ts` — Orchestrates file operations (copy, move, delete) via Worker threads. Tracks job queue with progress events.
- `src/main/browser/browserPaneManager.ts` — Creates and manages `WebContentsView` instances for browser panes with isolated session partitions.
- `src/main/archive/archiveService.ts` — Handles zip/tar.gz creation and extraction via adapters (`zipAdapter.ts`, `tarGzipAdapter.ts`).
- `src/main/notes/notesService.ts` — Manages markdown notes file persistence.
- `src/main/security/browserSecurity.ts` — CSP headers and navigation rules for browser panes.
- `src/main/menu.ts` — App menu configuration.
- `src/main/protocol/registerAppProtocol.ts` — Custom `app://` protocol for serving renderer assets.
- `src/main/workers/fileOpsWorker.ts` — Worker thread script for CPU-intensive file operations.

### Preload (`src/preload/index.ts`)
Exposes a typed `window.electronAPI` surface via `contextBridge.exposeInMainWorld`. Acts as the security boundary — renderer cannot access Node.js APIs directly.

### Renderer Process (`src/renderer/`)
Entry: `src/renderer/main.tsx` → mounts `App.tsx`.

**State model:** All state lives in `App.tsx` and flows down as props. No React context, no global store in renderer.

**Layout hierarchy:**
```
App.tsx
  └── WorkspaceRail (src/renderer/layout/WorkspaceRail.tsx)
  └── PaneGrid (src/renderer/layout/PaneGrid.tsx)
        ├── FileBrowserPane (src/renderer/panes/file-browser/FileBrowserPane.tsx)
        ├── TerminalPane (src/renderer/panes/terminal/TerminalPane.tsx)
        ├── BrowserPlaceholderPane (src/renderer/panes/browser/BrowserPlaceholderPane.tsx)
        └── NotesPane (src/renderer/panes/notes/NotesPane.tsx)
```

### Shared (`src/shared/contracts.ts`)
Type-safe IPC contracts shared between main and renderer. Defines channel names as constants and TypeScript interfaces for all IPC message payloads.

## Data Flow

### Renderer → Main (command)
1. Renderer calls `window.electronAPI.someMethod(payload)`
2. Preload forwards via `ipcRenderer.invoke('channel', payload)`
3. Main process `ipcMain.handle('channel', handler)` executes
4. Result returned as Promise to renderer

### Main → Renderer (event/push)
1. Main calls `BrowserWindow.webContents.send('channel', data)`
2. Preload registers listener, calls renderer callback
3. React state updates via `useEffect` listener

### Worker Thread Flow
1. `FileJobManager` spawns `fileOpsWorker.ts` via `worker_threads`
2. Worker posts progress messages back to manager
3. Manager relays progress to renderer via IPC events

## Key Abstractions
- **Pane** — The primary UI unit. Four types: file-browser, terminal, browser, notes. Each pane is independently configurable in the workspace grid.
- **Workspace** — The full layout of active panes, persisted in `StateStore`.
- **Job** — A tracked file operation (copy/move/delete) with progress, managed by `FileJobManager`.
- **Session** — A terminal PTY session or browser pane session, with isolated state.
