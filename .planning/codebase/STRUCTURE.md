# Directory Structure — Ananke Commander

## Top-Level Layout

```
ananke-commander/
├── src/
│   ├── main/           # Electron main process (Node.js)
│   ├── preload/        # Electron preload scripts
│   ├── renderer/       # React UI (Chromium renderer)
│   ├── shared/         # Types shared across process boundaries
│   └── workers/        # (mapped to main/workers/) Worker thread scripts
├── resources/          # App icons and static assets
├── .planning/          # GSD planning artifacts
├── package.json
├── electron.vite.config.ts   # electron-vite build config
├── electron-builder.yml      # Packaging config
└── tsconfig.*.json           # TypeScript configs per process
```

## `src/main/` — Main Process

```
src/main/
├── index.ts                    # Entry point: BrowserWindow, app lifecycle
├── menu.ts                     # Application menu
├── archive/
│   ├── archiveService.ts       # Facade for zip/tar operations
│   ├── pathSafe.ts             # Path sanitization for archives
│   ├── tarGzipAdapter.ts       # tar.gz implementation
│   └── zipAdapter.ts           # zip implementation
├── browser/
│   └── browserPaneManager.ts   # WebContentsView lifecycle + isolation
├── jobs/
│   └── fileJobManager.ts       # Worker thread job queue + progress tracking
├── notes/
│   └── notesService.ts         # Markdown notes read/write
├── protocol/
│   └── registerAppProtocol.ts  # Custom app:// protocol handler
├── pty/
│   └── terminalManager.ts      # node-pty wrapper: spawn/resize/destroy
├── security/
│   └── browserSecurity.ts      # CSP + navigation policy for browser panes
├── store/
│   └── stateStore.ts           # electron-store persistence layer
└── workers/
    └── fileOpsWorker.ts        # Worker thread: copy/move/delete implementation
```

## `src/preload/` — Preload Bridge

```
src/preload/
└── index.ts    # contextBridge.exposeInMainWorld('electronAPI', {...})
```

## `src/renderer/` — React UI

```
src/renderer/
├── index.html              # HTML shell
├── main.tsx                # React entry: ReactDOM.createRoot → <App />
├── vite-env.d.ts           # Vite type declarations
├── app/
│   └── App.tsx             # Root component, all state, IPC wiring
├── layout/
│   ├── PaneGrid.tsx        # Resizable pane grid layout
│   ├── PaneHeader.tsx      # Pane title bar with close/type controls
│   ├── RecentlyClosedPanel.tsx  # Recently closed panes list
│   └── WorkspaceRail.tsx   # Left sidebar: workspace switcher + pane launchers
├── lib/
│   └── pathUtils.ts        # Path manipulation utilities (renderer-side)
├── panes/
│   ├── browser/
│   │   └── BrowserPlaceholderPane.tsx  # Placeholder (real browser is WebContentsView)
│   ├── file-browser/
│   │   ├── ArchiveDialog.tsx     # Archive creation UI
│   │   ├── FileBrowserPane.tsx   # Main file browser (directory listing, ops)
│   │   └── FileList.tsx          # Virtualized(?) file list component
│   ├── notes/
│   │   └── NotesPane.tsx         # Markdown notes editor
│   └── terminal/
│       ├── TerminalPane.tsx      # xterm.js terminal wrapper
│       └── useXterm.ts           # xterm.js initialization hook
├── settings/
│   ├── NotesSettings.tsx         # Notes configuration panel
│   └── PrivacySettings.tsx       # Privacy/browser session settings
└── styles/
    └── global.css                # Global CSS variables and base styles
```

## `src/shared/` — Cross-Process Types

```
src/shared/
└── contracts.ts    # IPC channel constants + TypeScript interfaces
                    # Used by both main process and renderer
```

## Key File Locations

| Purpose | File |
|---------|------|
| App entry (main) | `src/main/index.ts` |
| App entry (renderer) | `src/renderer/main.tsx` |
| Root React component | `src/renderer/app/App.tsx` |
| IPC type contracts | `src/shared/contracts.ts` |
| State persistence | `src/main/store/stateStore.ts` |
| Terminal management | `src/main/pty/terminalManager.ts` |
| File operations | `src/main/jobs/fileJobManager.ts` |
| Browser panes | `src/main/browser/browserPaneManager.ts` |
| File browser UI | `src/renderer/panes/file-browser/FileBrowserPane.tsx` |
| Global styles | `src/renderer/styles/global.css` |
| Build config | `electron.vite.config.ts` |

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| React components | `PascalCase.tsx` | `FileBrowserPane.tsx` |
| Services/managers | `camelCase.ts` | `terminalManager.ts` |
| Hooks | `use` prefix, camelCase | `useXterm.ts` |
| CSS files | Co-located with component | `FileBrowserPane.css` |
| Worker scripts | `*Worker.ts` | `fileOpsWorker.ts` |
| Adapters | `*Adapter.ts` | `zipAdapter.ts` |
