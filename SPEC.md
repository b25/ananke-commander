# Ananke Commander — Technical Specification

## Overview

Ananke Commander is a workspace-oriented Electron desktop shell for developers. The core metaphor is a **2×2 virtual canvas** of four independently scrollable "screens", each populated with floating, tiled panes. Users manage files, run terminals, browse the web, take notes, explore disk usage visually, run GitUI, and decode gRPC/API payloads — all within named, persistently stored workspaces.

State is dual-persisted: JSON via `electron-store` and a hot-reloadable `workspace.toml` that can be hand-edited outside the app.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Electron | 40.x |
| UI framework | React | 19.0.0 |
| Language | TypeScript (strict) | 5.7.2 |
| Build | electron-vite + Vite | 3.0.0 / 6.4.2 |
| Packaging | electron-builder | 25.1.8 |
| Terminal emulation | @xterm/xterm + WebGL addon | 5.5.0 |
| PTY | node-pty | 1.0.0 |
| Virtual lists | @tanstack/react-virtual | 3.13.23 |
| State persistence | electron-store | 10.0.0 |
| TOML | smol-toml | 1.6.1 |
| Archive (write) | archiver (zip) + tar (tgz) | 7.0.1 / 7.4.3 |
| Archive (read) | yauzl (zip) + tar (tgz) | 3.2.0 |
| Disk-usage viz | d3-hierarchy | 3.1.2 |
| gRPC decode | protobufjs | 8.0.1 |
| Browser pane | Electron `WebContentsView` | — |
| App protocol | Custom `app://` scheme | — |
| Security model | contextIsolation + sandbox | no nodeIntegration |

---

## Architecture

```
src/
├── main/           # Electron main process
│   ├── index.ts    # IPC handler registry (60+ channels)
│   ├── menu.ts     # Native OS application menu
│   ├── tomlConfig.ts
│   ├── archive/    # zip + tgz pack/unpack
│   ├── browser/    # WebContentsView lifecycle + HAR capture
│   ├── jobs/       # Worker thread file operations + folder size
│   ├── notes/      # Obsidian vault read/write
│   ├── protocol/   # app:// scheme handler
│   ├── pty/        # node-pty terminal manager
│   ├── security/   # Navigation guards + permission denial
│   ├── store/      # electron-store JSON + TOML dual persistence
│   └── workers/    # fileOpsWorker.ts, folderSizeWorker.ts
├── preload/
│   └── index.ts    # contextBridge — exposes typed IPC surface
├── renderer/       # React UI
│   ├── app/App.tsx # Root component — all workspace/pane state
│   ├── layout/     # Canvas, workspace rail, pane wrappers, overlays
│   ├── panes/      # One folder per pane type
│   ├── lib/        # Layout engine, path utilities
│   ├── settings/   # Settings panel components
│   └── styles/     # global.css + tokens.css design system
└── shared/
    └── contracts.ts  # TypeScript interfaces shared by all three processes
```

### Process Boundary

All file system, PTY, browser, archive, and note operations execute in the **main process**. The renderer communicates exclusively via the typed IPC bridge exposed through `preload/index.ts`. Workers handle CPU-heavy tasks (file copy/move/delete, folder size traversal) in separate Node.js worker threads.

---

## State Data Model

```typescript
// src/shared/contracts.ts

interface AppStateSnapshot {
  workspaces: WorkspaceState[];
  activeWorkspaceId: string;
  settings: AppSettings;
  recentlyClosed: RecentlyClosedEntry[];
}

interface WorkspaceState {
  id: string;
  name: string;
  panes: PaneState[];
  activePaneId: string | null;
  canvasOffset: { x: number; y: number };   // active screen (0-3)
  screenLayouts: Record<number, string>;     // current layout per screen
  intentLayouts: Record<number, string>;     // user's explicit layout intent
  screenCollapsed: Record<number, string[]>; // collapsed pane IDs per screen
}

interface PaneState {
  id: string;
  type: PaneType;  // 'file-browser' | 'terminal' | 'browser' | 'notes' | 'radar' | 'gitui' | 'api-toolkit'
  title: string;
  // Geometry — both pixel and fractional forms
  x: number; y: number; width: number; height: number;
  xPct: number; yPct: number; wPct: number; hPct: number;
  // Integer part of xPct/yPct encodes screen index (0=TL 1=TR 2=BL 3=BR)
  collapsed?: boolean;
  // Pane-specific extra state
  cwd?: string;        // terminal, file-browser, gitui
  url?: string;        // browser
  noteId?: string;     // notes
}

interface AppSettings {
  privacy: {
    terminalHistoryMax: number;
    browserHistoryMax: number;
    notesUndoMax: number;
    recentlyClosedMax: number;
    privateMode: boolean;
  };
  obsidian: {
    vaultPath: string;
    subfolder: string;
  };
  terminal: {
    fontSize: number;
    fontFamily: string;
  };
}

interface RecentlyClosedEntry {
  pane: PaneState;
  closedAt: number;
  workspaceName: string;
}
```

### Persistence

- **Primary store**: `<userData>/ananke-commander-state.json` via `electron-store`. Writes are debounced 300 ms.
- **TOML mirror**: `<userData>/workspace.toml` via `smol-toml`. Writes debounced 500 ms. File-watched with 200 ms debounce; changes auto-merge back into the store. Writes are atomic (write to `.tmp`, then rename).
- **Browser history**: `<userData>/ananke-browser-history` (separate electron-store instance).
- **Legacy migration**: On first launch after rename, migrates from `totalcmd-state.json` if present.
- **Path sanitization**: Any persisted directory path that no longer exists is reset to `homedir()` on startup.

---

## Canvas & Layout System

### Virtual Canvas

The workspace canvas is a **2×2 grid** of "screens". Only one screen is visible at a time. The active screen is determined by `canvasOffset`, which moves the visible viewport over the underlying 2×2 grid.

Navigation between screens: `Alt+Arrow` keys or clicking the `ScreenSelector` component.

### Layout Engine (`src/renderer/lib/layouts.ts`)

Seven named layouts, each defining slot geometries as fractions of the screen:

| ID | Label | Slot count |
|---|---|---|
| `full` | Full | 1 |
| `halves` | ½ + ½ | 2 |
| `1h-2v` | ½ + 2 stacked | 3 |
| `4-quad` | 2×2 quad | 4 |
| `1h-3v` | ½ + 3 stacked | 4 |
| `6-grid` | 2×3 grid | 6 |
| `9-grid` | 3×3 grid | 9 |

**Auto-progression path**: `full → halves → 4-quad → 6-grid → 9-grid`

Key functions:

| Function | Purpose |
|---|---|
| `applyLayout(panes, layout, screenIdx, viewport)` | Assign pixel + fractional geometry to existing panes |
| `bestLayout(count)` | Return the smallest layout that fits `count` panes |
| `fittingLayout(layout, viewport)` | Downgrade layout if viewport is too small for minimum slot size |
| `nextProgressionLayout(current)` | Return the next layout in the auto-progression sequence |

Panes store geometry in **both** pixel (`x, y, width, height`) and fractional (`xPct, yPct, wPct, hPct`) forms. On viewport resize the fractional form is used to recompute pixel values. The screen index is encoded in the integer part of `xPct`/`yPct`.

### Pane Collapse

Panes can be collapsed to the `TaskbarStrip` without being closed. Collapsed panes appear as ghosted pills. Restoring a collapsed pane brings it back to its last geometry and re-applies the fitting layout.

---

## Pane Types — Detailed Specifications

### 1. File Browser (`file-browser`)

**Component**: `src/renderer/panes/file-browser/FileBrowserPane.tsx`

A dual-panel file manager. Left and right panels are independent directory listings. Focus can switch between panels with `Tab`.

#### Panel layout

Each panel contains:
- **Path bar** — clickable to enter an editable text path. Shows current directory.
- **File list** — virtualized with `@tanstack/react-virtual` at 16 px row height.
- **Status bar** — selected count, total item count.

#### File list (`FileList.tsx`)

- ".." parent entry always first.
- Directories listed before files, both sorted alphabetically (case-insensitive).
- Multi-select: click, Shift+click (range), Ctrl/Cmd+click (toggle).
- Keyboard navigation: Arrow keys move cursor; Space toggles selection; Enter opens item.
- Inline rename: activated by F2 or slow double-click on name; confirmed by Enter, cancelled by Escape.
- Folder sizes: streamed progressively from `folderSizeWorker` and displayed in the size column.
- Show/hide dotfiles: toggle via toolbar button.

#### Keyboard shortcuts

| Key | Action |
|---|---|
| F2 | Rename selected item (inline) |
| F3 | Open file in read-only viewer |
| F4 | Open file in editor |
| F5 | Copy selected items (opens dialog) |
| F6 | Move selected items (opens dialog) |
| F7 | Create new folder (inline prompt) |
| Alt+F7 | Create new file |
| F8 | Delete selected items (with confirmation) |
| Tab | Switch active panel (left ↔ right) |
| Enter | Enter folder / open file |
| Ctrl/Cmd+Arrow | Mirror current path to other panel |
| Alt+Left/Right | Navigate back/forward in path history |

#### File operations

All operations run in a **worker thread** (`fileOpsWorker.ts`) via `FileJobManager`. Only one job runs at a time. Progress is streamed to the renderer as IPC push events (`fileJob:progress`, `fileJob:done`, `fileJob:error`). The active job can be cancelled.

Operations: copy, move, delete (to trash on macOS/Windows, direct delete on Linux).

#### Archive operations (`ArchiveDialog.tsx`)

Pack formats: zip, tgz. Unpack: auto-detect by extension. Pack produces a single archive from the selected items. Unpack extracts to the current directory. Path traversal is prevented (`pathSafe.ts`).

#### Context menu (`ContextMenu.tsx`)

Right-click on any file list item shows: Open, Rename, Copy, Move, Delete, Copy Path, New Terminal Here, New GitUI Here, Archive, Properties (chmod). Separator + danger styling for destructive actions.

#### File viewer/editor (`FileEditor.tsx`)

Modal overlay. Read-only mode (F3) or edit mode (F4). Edit mode allows saving with Ctrl/Cmd+S. Files are read and written as UTF-8 via `fs:readUtf8` / `fs:writeUtf8`.

#### Folder size streaming

`useFolderSize.ts` + `folderSizeAccumulator.ts` manage per-pane folder-size state. Sizes are fetched per-directory as the user navigates. Results are cached for the session.

#### Actions toolbar (`FileBrowserActions.tsx`)

Inline toolbar in the pane header: Read, Edit, Copy, Move, New Folder, New File, Delete, Archive (pack/unpack), Toggle Hidden, Copy Path, New Terminal Here, New GitUI Here, Chmod.

---

### 2. Terminal (`terminal`)

**Components**: `src/renderer/panes/terminal/TerminalPane.tsx`, `useXterm.ts`

A full PTY terminal using `node-pty` + xterm.js with WebGL rendering.

#### Initialization

1. Renderer calls `pty:spawn` with `{ cols, rows, cwd }`.
2. Main process creates a `node-pty` instance with a login shell (`/bin/zsh` on macOS, `cmd.exe` on Windows).
3. Homebrew PATH (`/opt/homebrew/bin`, `/usr/local/bin`) is injected into the PTY environment on macOS.
4. xterm.js attaches: WebGL renderer addon, FitAddon (auto-fit on resize), WebLinksAddon (clickable URLs).
5. A context-loss handler re-initializes xterm.js if the WebGL context is lost.

#### Output buffering

The PTY manager flushes output to the renderer every **8 ms** (batched), preventing rendering bottlenecks on high-throughput programs.

#### CWD tracking

The shell emits OSC 7 (`file://host/path`) or `\e]7;path\a` sequences. The terminal pane parses these and updates `pane.cwd` in state. Updates are debounced to prevent rapid re-render loops. Only absolute paths are persisted.

#### Context menu

Right-click inside the terminal: Copy (if selection exists), Paste, Clear.

#### Shutdown sequence

On pane close: `pty:dispose` sends Ctrl+D to the shell, then waits 300 ms before `SIGKILL` to allow the shell history to flush.

#### Resize

`pty:resize` is called whenever the terminal pane is resized or activated, syncing PTY dimensions with the xterm.js viewport.

---

### 3. Browser (`browser`)

**Components**: `src/renderer/panes/browser/BrowserPlaceholderPane.tsx`, `BrowserActions.tsx`, `BrowserMenu.tsx`
**Main**: `src/main/browser/browserPaneManager.ts`, `browserSecurity.ts`, `harCapture.ts`

An embedded browser via Electron `WebContentsView` with per-pane isolated sessions.

#### Session isolation

Each browser pane gets a dedicated persistent session: `persist:guest-{paneId}`. Sessions are not shared between panes. Navigation guards prevent navigation to `file://` URLs and other non-http(s) schemes.

#### Toolbar (BrowserPlaceholderPane)

- **Back / Forward / Stop / Reload** buttons.
- **SSL indicator** — padlock icon reflects current page security state.
- **URL bar** — shows current URL; accepts URLs or plain text (falls back to default search engine). Activated by Cmd/Ctrl+L.
- **Open in system browser** button.
- **History dropdown** — shows recent URLs for this pane; click to navigate.
- **Loading bar** — thin progress indicator at top of pane.
- **Find-in-page bar** — activated by Cmd/Ctrl+F; hides on Escape.

#### Bounds synchronization

`BrowserPlaceholderPane` uses `IntersectionObserver` + `ResizeObserver` to compute the pane's position on screen and sends `browser:layout` to move the `WebContentsView` to the correct position. The view is suspended (moved off-screen) when the pane is not visible.

#### Keyboard shortcuts

| Key | Action |
|---|---|
| Cmd/Ctrl+L | Focus URL bar |
| Cmd/Ctrl+R | Reload |
| Cmd/Ctrl+F | Find in page |
| Cmd/Ctrl+Shift+I | Open DevTools |
| Cmd/Ctrl+= | Zoom in |
| Cmd/Ctrl+- | Zoom out |
| Cmd/Ctrl+0 | Reset zoom |

#### Context menu (native)

Right-click in the `WebContentsView`: Cut/Copy/Paste/Select All, Search for text, Open link in system browser, Copy link/image URL, Back/Forward/Reload, Save to Obsidian Vault, Inspect Element.

#### HAR recording (`harCapture.ts`)

HAR (HTTP Archive format) recording can be started/stopped per pane. Captures request/response headers, timing, and body via `webRequest` interception. Exported as a `.har` JSON file.

#### Clip to Vault

"Save to Obsidian Vault" captures the page URL + title + selection (if any) as a Markdown note and saves it to the configured Obsidian vault.

#### History persistence

Navigation history per pane (up to `browserHistoryMax` entries) is stored in a separate electron-store instance (`ananke-browser-history`). History survives app restarts.

#### Security model (`browserSecurity.ts`)

- All permission requests (camera, microphone, notifications, etc.) are denied.
- Navigation is allowed only to valid `http://`, `https://`, `about:`, or `data:` URLs.
- `file://` navigation is blocked.
- `new-window` events open in the system browser.

---

### 4. Notes (`notes`)

**Component**: `src/renderer/panes/notes/NotesPane.tsx`
**Main**: `src/main/notes/notesService.ts`
**Settings**: `src/renderer/settings/NotesSettings.tsx`

A Markdown note editor with Obsidian vault integration.

#### Views

- **Editor view** — full textarea for writing Markdown. Custom undo stack (up to `notesUndoMax` entries). Word and character count displayed.
- **Vault list view** — searchable list of notes saved to the vault. Click to open in editor. Delete, export to file, copy to clipboard.

#### Keyboard shortcuts

| Key | Action |
|---|---|
| Ctrl/Cmd+S | Save note to vault |
| Ctrl/Cmd+Z | Undo (custom stack) |

#### Vault integration

Notes are stored as Markdown files under `{vaultPath}/{subfolder}/`. Files include YAML frontmatter with title and creation date. The vault path and subfolder are configurable in Settings.

#### Save/load

- `notes:saveVault` — writes note to disk with frontmatter.
- `notes:listVault` — lists all `.md` files in the vault subfolder.
- `notes:readVault` — reads a note file.
- `notes:deleteVault` — deletes a note file.

---

### 5. Radar (`radar`)

**Components**: `src/renderer/panes/radar/RadarPane.tsx`, `SunburstChart.tsx`, `useRadarData.ts`

A visual disk-usage explorer using a D3 sunburst chart.

#### Sunburst chart (`SunburstChart.tsx`)

Built with `d3-hierarchy`. The root node is the selected directory. Each arc represents a file or folder, sized proportionally to its disk usage. Clicking an arc drills down into that folder.

- Hover highlights the hovered arc and its ancestors.
- Size labels appear on arcs large enough to display them.
- Center click returns to parent.

#### Data loading (`useRadarData.ts`)

Directory tree is built progressively:
1. `fs:listDir` fetches immediate children.
2. `fs:startFolderSize` streams sizes for subdirectories.
3. The `RadarNode` tree is updated as sizes arrive, causing incremental chart updates.

Loading progress is displayed as a percentage in the pane.

#### Navigation

- Breadcrumb bar shows the current path; clicking any segment navigates up.
- Pressing Enter on a selected folder navigates to it in any active File Browser pane (dispatches `radar:navigate` custom event).

---

### 6. GitUI (`gitui`)

**Component**: `src/renderer/panes/gitui/GitUiPane.tsx`

An embedded GitUI TUI application running in a PTY terminal session (same stack as the terminal pane).

#### Error states

- **Not found** — displays an overlay with a "Install via Homebrew" button (`brew install gitui`) and a "Retry" button.
- **Other errors** — displays the error message and a "Retry" button.

#### Session

Opens `gitui` with `cwd` set to the workspace's last known directory. On close, the PTY is disposed.

---

### 7. API Toolkit (`api-toolkit`)

**Component**: `src/renderer/panes/api-toolkit/ApiToolkitPane.tsx`

A gRPC/Protobuf decoder and (planned) Postman collection importer.

#### Proto decoder tab

1. Upload a `.proto` schema file.
2. Select the message type from the list of parsed message definitions.
3. Upload a binary protobuf payload file.
4. Click "Decode" — the payload is decoded against the selected message type and displayed as formatted JSON.
5. Copy the JSON output to clipboard.

#### Postman importer tab

Status: stub / "coming soon" placeholder.

---

## Layout UI Components

### App.tsx

Root component. Owns all workspace and pane state (fetched from main on startup via `state:get`). Handles:

- Workspace switching: updates `activeWorkspaceId`, resets canvas offset.
- Pane lifecycle: create, activate, close, collapse, restore.
- Layout application: calls `applyLayout` when the viewport, active screen, or layout changes.
- Settings drawer: renders `NotesSettings` and `PrivacySettings`.
- Recently Closed panel.
- Diagnostics overlay toggle.

State mutations flow: renderer calls an IPC handler → main updates the store → main returns the new state → renderer re-renders.

### WorkspaceRail (`src/renderer/layout/WorkspaceRail.tsx`)

56 px fixed left rail. Contains:

- Numbered workspace pills (1–9). Active workspace highlighted with `--accent`.
- Double-click to rename (inline input).
- Right-click context menu: Clone workspace, Delete workspace.
- "+" button to create a new workspace.

### CanvasWorkspace (`src/renderer/layout/CanvasWorkspace.tsx`)

Full-viewport div. Renders the 4 panes of the active screen. Uses `ResizeObserver` to track viewport dimensions and report them to `App`. Handles `Alt+Arrow` keydown to pan the canvas (change active screen).

### FloatingPane (`src/renderer/layout/FloatingPane.tsx`)

Absolute-positioned wrapper for each pane. Z-index: active pane = 10, others = 1. Passes click-to-activate to `App`.

### TaskbarStrip (`src/renderer/layout/TaskbarStrip.tsx`)

Fixed strip at the bottom of the canvas. Shows all panes on the active screen as pills. Collapsed panes appear ghosted. Click: activate or restore a pane. Each pill shows the pane type icon and truncated title.

### ScreenSelector (`src/renderer/layout/ScreenSelector.tsx`)

2×2 grid of mini-layout thumbnails, one per screen. Click or arrow-key to switch the active screen. The active screen is highlighted. Layout thumbnail is drawn using `layoutThumb.tsx` (SVG).

### LayoutPicker (`src/renderer/layout/LayoutPicker.tsx`)

Popover triggered by a toolbar button. Shows all 7 layout options as thumbnail previews. Clicking one applies that layout to the current screen (sets `intentLayout`, calls `applyLayout`).

### NewPanePicker (`src/renderer/layout/NewPanePicker.tsx`)

"New ▾" dropdown button. Lists all 6 creatable pane types (not radar, which has no standalone creation flow). Clicking creates a new pane of that type, advances the layout progression, and assigns geometry.

### PaneHeader (`src/renderer/layout/PaneHeader.tsx`)

Pane title bar. Left: type icon + title. Center/Right: optional pane-specific action buttons (rendered by the pane type). Far right: close button (×). Click anywhere non-interactive on the header activates the pane.

### AppMenuDropdown (`src/renderer/layout/AppMenuDropdown.tsx`)

"⋮" button in the top-right corner. Dropdown menu items:

- Toggle Diagnostics overlay
- Recently Closed panes panel
- Settings drawer

### RecentlyClosedPanel (`src/renderer/layout/RecentlyClosedPanel.tsx`)

Side drawer listing recently closed panes (up to `recentlyClosedMax`). Each entry shows pane type, title, and workspace it came from. Actions: restore (re-adds to current workspace), remove, clear all.

### TomlEditorModal (`src/renderer/layout/TomlEditorModal.tsx`)

Full-screen modal TOML editor. Features:

- Syntax-preserving text editor (plain `<textarea>`).
- Find bar (Cmd/Ctrl+F): highlight matches, navigate with Enter/Shift+Enter.
- Replace bar (Cmd/Ctrl+H): replace current / replace all.
- Tab key inserts 2 spaces.
- "Apply" button (or Cmd/Ctrl+S): pauses the file watcher, writes the TOML, resumes the watcher, and applies the new state to the app.
- Escape: close find/replace bar or close the modal.

### DiagOverlay (`src/renderer/layout/DiagOverlay.tsx`)

Floating debug overlay (toggled from AppMenuDropdown). Displays:

- Viewport pixel dimensions.
- Canvas size and offset.
- Per-pane breakdown: screen index, slot fraction, pixel geometry.

---

## IPC Contract

All IPC channels are typed via `src/shared/contracts.ts` and exposed through `preload/index.ts` as `window.api`.

### State channels

| Channel | Direction | Payload |
|---|---|---|
| `state:get` | invoke | → `AppStateSnapshot` |
| `state:set` | invoke | `AppStateSnapshot` → void |
| `state:replacePanes` | invoke | `{ workspaceId, panes }` → void |
| `state:addWorkspace` | invoke | `WorkspaceState` → void |
| `state:setActiveWorkspace` | invoke | `string` → void |
| `state:setActivePane` | invoke | `{ workspaceId, paneId }` → void |
| `state:updatePane` | invoke | `{ workspaceId, pane }` → void |
| `state:closePane` | invoke | `{ workspaceId, paneId }` → `RecentlyClosedEntry[]` |
| `state:removeRecentlyClosed` | invoke | `index` → void |
| `state:purgeRecentlyClosed` | invoke | — → void |
| `state:restoreClosed` | invoke | `{ entry, workspaceId }` → `PaneState` |
| `state:setCanvasOffset` | invoke | `{ workspaceId, offset }` → void |
| `state:setScreenLayout` | invoke | `{ workspaceId, screen, layout }` → void |
| `state:setIntentLayout` | invoke | `{ workspaceId, screen, layout }` → void |
| `state:setScreenCollapsed` | invoke | `{ workspaceId, screen, collapsedIds }` → void |
| `state:cloneWorkspace` | invoke | `string` → `WorkspaceState` |
| `state:renameWorkspace` | invoke | `{ id, name }` → void |
| `state:deleteWorkspace` | invoke | `string` → void |

### File system channels

| Channel | Direction | Payload |
|---|---|---|
| `fs:readUtf8` | invoke | `path` → `string` |
| `fs:writeUtf8` | invoke | `{ path, content }` → void |
| `fs:listDir` | invoke | `path` → `DirEntry[]` |
| `fs:quickOp` | invoke | `{ op: 'mkdir'|'delete', path }` → void |
| `fs:chmod` | invoke | `{ path, mode }` → void |
| `fs:createFile` | invoke | `path` → void |
| `fs:rename` | invoke | `{ oldPath, newPath }` → void |
| `fs:startFolderSize` | invoke | `{ path, requestId }` → void |
| `fs:cancelFolderSize` | invoke | `requestId` → void |
| `fs:folderSize:progress` | push | `{ requestId, path, size }` |
| `fs:folderSize:done` | push | `{ requestId, totalSize }` |
| `fs:folderSize:error` | push | `{ requestId, error }` |

### File job channels

| Channel | Direction | Payload |
|---|---|---|
| `fileJob:start` | invoke | `{ op: 'copy'|'move'|'delete', src[], dst? }` → `jobId` |
| `fileJob:cancel` | invoke | `jobId` → void |
| `fileJob:progress` | push | `{ jobId, done, total, current }` |
| `fileJob:done` | push | `{ jobId }` |
| `fileJob:error` | push | `{ jobId, error }` |

### PTY channels

| Channel | Direction | Payload |
|---|---|---|
| `pty:spawn` | invoke | `{ id, cols, rows, cwd }` → void |
| `pty:write` | invoke | `{ id, data }` → void |
| `pty:resize` | invoke | `{ id, cols, rows }` → void |
| `pty:dispose` | invoke | `id` → void |
| `pty:data` | push | `{ id, data: string }` |
| `pty:exit` | push | `{ id, code }` |

### Browser channels

| Channel | Direction | Payload |
|---|---|---|
| `browser:layout` | invoke | `{ id, bounds }` → void |
| `browser:navigate` | invoke | `{ id, url }` → void |
| `browser:goBack` | invoke | `id` → void |
| `browser:goForward` | invoke | `id` → void |
| `browser:stop` | invoke | `id` → void |
| `browser:reload` | invoke | `id` → void |
| `browser:getHistory` | invoke | `id` → `string[]` |
| `browser:clearHistory` | invoke | `id` → void |
| `browser:suspend` | invoke | `id` → void |
| `browser:destroy` | invoke | `id` → void |
| `browser:openDevTools` | invoke | `id` → void |
| `browser:setZoom` | invoke | `{ id, factor }` → void |
| `browser:resetZoom` | invoke | `id` → void |
| `browser:findInPage` | invoke | `{ id, text, forward?, matchCase? }` → void |
| `browser:stopFindInPage` | invoke | `id` → void |
| `browser:getPageInfo` | invoke | `id` → `{ url, title, canGoBack, canGoForward }` |
| `browser:harStart` | invoke | `id` → void |
| `browser:harStop` | invoke | `id` → void |
| `browser:harGetData` | invoke | `id` → `HarLog` |
| `browser:harIsRecording` | invoke | `id` → `boolean` |
| `browser:harGetEntryCount` | invoke | `id` → `number` |
| `browser:history` | push | `{ id, history: string[] }` |
| `browser:titleUpdate` | push | `{ id, title }` |
| `browser:loadingState` | push | `{ id, loading, progress }` |
| `browser:urlUpdate` | push | `{ id, url }` |
| `browser:clipToVault` | push | `{ id, url, title, selection }` |

### Notes channels

| Channel | Direction | Payload |
|---|---|---|
| `notes:saveVault` | invoke | `{ id, title, content }` → void |
| `notes:listVault` | invoke | — → `NoteEntry[]` |
| `notes:readVault` | invoke | `id` → `string` |
| `notes:deleteVault` | invoke | `id` → void |

### Archive channels

| Channel | Direction | Payload |
|---|---|---|
| `archive:pack` | invoke | `{ format: 'zip'|'tgz', src[], dst }` → void |
| `archive:unpack` | invoke | `{ src, dst }` → void |

### Config channels

| Channel | Direction | Payload |
|---|---|---|
| `config:getTomlPath` | invoke | — → `string` |
| `config:openToml` | invoke | — → void |
| `config:writeToml` | invoke | `content: string` → void |
| `config:pauseWatch` | invoke | — → void |
| `config:resumeWatch` | invoke | — → void |
| `config:readToml` | invoke | — → `string` |
| `config:applyToml` | invoke | `content: string` → `AppStateSnapshot` |
| `config:state-changed` | push | `AppStateSnapshot` |
| `config:toml-error` | push | `{ error: string }` |

### Shell / dialog channels

| Channel | Direction | Payload |
|---|---|---|
| `shell:openExternal` | invoke | `url` → void |
| `shell:openPath` | invoke | `path` → void |
| `dialog:pickDirectory` | invoke | — → `string \| null` |
| `dialog:saveFile` | invoke | `{ defaultPath?, filters? }` → `string \| null` |
| `app:getPath` | invoke | `name: 'home'|'documents'|'downloads'|'userData'` → `string` |
| `clipboard:writeText` | invoke | `text` → void |

---

## Design System

### Tokens (`src/renderer/styles/tokens.css`)

Dark-only theme. All values expressed as CSS custom properties.

#### Colors

| Token | Value | Usage |
|---|---|---|
| `--bg` | #0d1117 | App background |
| `--rail` | #161b22 | Workspace rail, strips |
| `--pane` | #161b22 | Pane background |
| `--header` | #1c2128 | Pane header, taskbar |
| `--border` | #30363d | All borders |
| `--text` | #e6edf3 | Primary text |
| `--muted` | #8b949e | Secondary / placeholder text |
| `--accent` | #388bfd | Active, focus, selected highlight |
| `--attention` | #d29922 | Warnings |
| `--danger` | #f85149 | Destructive actions, errors |
| `--hover` | rgba(255,255,255,0.06) | Hover states |
| `--selected` | rgba(56,139,253,0.15) | Selected rows |

#### Spacing

| Token | Value |
|---|---|
| `--space-xs` | 4 px |
| `--space-sm` | 8 px |
| `--space-md` | 12 px |
| `--space-lg` | 16 px |
| `--space-xl` | 24 px |
| `--space-gap` | 6 px |
| `--space-inset` | 10 px |

#### Typography

| Token | Value |
|---|---|
| `--text-2xs` | 10 px |
| `--text-xs` | 11 px |
| `--text-sm` | 12 px |
| `--text-md` | 13 px |
| `--text-lg` | 15 px |
| `--weight-normal` | 400 |
| `--weight-medium` | 500 |
| `--font-sans` | system-ui, -apple-system, sans-serif |
| `--font-mono` | "JetBrains Mono", "Fira Code", monospace |

#### Border radius

| Token | Value |
|---|---|
| `--radius-xs` | 2 px |
| `--radius-sm` | 4 px |
| `--radius-md` | 6 px |
| `--radius-lg` | 8 px |

---

## Security Model

- **Renderer isolation**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer has no direct Node.js access.
- **Preload bridge**: All IPC exposed via `contextBridge` with typed, minimal surface.
- **Browser sessions**: Each `WebContentsView` uses a dedicated isolated session. Permission requests are denied by `hardenGuestSession()`.
- **Navigation guards**: `attachGuestWebContentsGuards()` blocks `file://` and non-http(s) navigations. New windows open in the system browser.
- **Archive path traversal**: `pathSafe.ts` rejects any archive entry whose resolved path escapes the destination directory.
- **App protocol**: UI assets are served via the privileged `app://` scheme, not `file://`, to allow CSP enforcement.

---

## Build & Distribution

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start electron-vite dev server with HMR on port 5173 |
| `npm run build` | Compile TypeScript + Vite bundle into `out/` |
| `npm run start` | Launch the compiled app from `out/` |
| `npm run package` | Build + package as platform-native installer via electron-builder |

### electron-builder config (in `package.json`)

- `appId`: `com.ananke.commander`
- macOS: `.app` + optional `.dmg`
- Windows: NSIS installer (`.exe`)
- Native modules (`node-pty`) are rebuilt for the target Electron version automatically.

### electron-vite config (`electron.vite.config.ts`)

Three entry points:
1. **Main** — compiled to CommonJS (Node.js).
2. **Preload** — compiled to CommonJS.
3. **Renderer** — Vite + React, outputs ESM bundle.

HMR: renderer hot-reloads on file change during `dev`. Main/preload changes require a full restart.

---

## Known Limitations & Non-Goals

- No tab system within panes — each pane is a single instance.
- Radar pane cannot be created from the "New Pane" picker; it is created programmatically (e.g., from File Browser's action bar).
- API Toolkit Postman import is a stub (not implemented).
- No light theme — dark-only.
- Single-job file operation queue: concurrent copy/move/delete is not supported.
- Browser pane uses `WebContentsView` (not a web standard `<iframe>`) and cannot be rendered in remote/headless mode.
