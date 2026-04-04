# Ananke Commander

Workspace-oriented **Electron** desktop shell: multiple workspaces, tiled panes, a **dual-pane file browser**, **terminals**, **embedded browser** tiles, **Markdown notes** (including save to an Obsidian vault path), and **ZIP / tar.gz** pack and unpack.

## Features

- **Workspaces** — rail switcher; pane layout persisted in `electron-store`.
- **File browser** — two lists per pane, path bar, **double-click** or **Enter** (single selection, focused list) to open a **folder** or launch a **file** with the OS default app; **F5** copy / **F6** move (to another file-browser pane in the workspace), **F8** delete; background **worker** jobs with progress and **Cancel**; **Arc** for archives.
- **Terminal** — `node-pty` in main, **xterm.js** + optional WebGL in the shell; scrollback size follows **Settings → Terminal scrollback lines**.
- **Browser** — `WebContentsView`, isolated session, allowlisted navigation (`example.com`, `localhost`, …); recent URL list capped by **Settings → Browser recent URLs**.
- **Notes** — edit Markdown, copy, export to file, **Save to vault** (vault path + subfolder in Settings).
- **Privacy** — private mode (skip recently-closed recording), retention fields, purge recently closed; settings persisted when you click **Save settings**.

## Requirements

- **Node.js** 20+ recommended (matches current toolchain).
- **npm** (or compatible client).

Native **`node-pty`** is rebuilt on **`npm install`** via `postinstall` (`electron-rebuild`). If the terminal fails to spawn after an Electron upgrade, run `npm install` again or `npx electron-rebuild -f -w node-pty`.

## Getting started

```bash
npm install
npm run dev
```

For a production **compile only** (output under `out/`):

```bash
npm run build:app
```

Then run Electron against `out/` the way you normally launch the app (e.g. from the IDE or `npx electron .` after `build:app`).

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | **electron-vite** dev server + Electron |
| `npm run preview` | Preview production renderer (see electron-vite docs) |
| `npm run build:app` | Build main, preload, and renderer into `out/` |
| `npm run build` | `build:app` then **electron-builder** → installers under `release/` |
| `npm run typecheck` | `tsc --noEmit` |

### macOS packaging without signing

For local artifacts without Apple code signing:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build
```

## Keyboard shortcuts (file browser pane focused)

| Key | Action |
|-----|--------|
| **F5** | Open copy dialog (destination = another file-browser pane) |
| **F6** | Open move dialog |
| **F8** | Delete selection (with confirmation) |
| **Escape** | Close copy / move / archive dialogs (when one is open) |
| **Enter** | With exactly one row selected in the focused list, open that folder or file (same as double-click) |

## Architecture (short)

- **Shell** loads from the custom **`app://`** protocol (no `file://` for UI); **preload** exposes a narrow API on **`window.ananke`** (`contextIsolation` + **sandbox**).
- **Application menu** — on **macOS**, standard **App** / **Edit** / **View** / **Window** menus; on **Windows/Linux**, **File** (quit) and **Edit**. When the app is **not packaged** (`app.isPackaged === false`), **View** also includes **Toggle Developer Tools** and **Reload** (macOS and Windows/Linux).
- **File copy/move/delete** jobs run in a **worker thread**; the main window receives progress / done / error events.
- **Browser** content is **not** in the React tree; **`WebContentsView`** is sized from a placeholder `div` in the renderer.

## Preload API

Renderer code uses **`window.ananke`** for IPC (state, `fs`, file jobs, `pty`, browser layout/history, archives, notes, dialogs, clipboard).

## Settings & state

- State file (JSON in the app **userData** directory): **`ananke-commander-state.json`** (via **electron-store**).
- **Obsidian** vault path and default subfolder (`ananke-commander-notes` by default) are configured in the Settings drawer.

## Migrating from the old “totalcmd” build

If an older **`totalcmd-state.json`** exists in the **same** Electron **`userData`** folder as this app (often true in **dev**), it is **copied once** to **`ananke-commander-state.json`** when the new store file is missing. **Packaged** apps usually use a different per-app support directory; moving data between those folders is **manual**.

## Benchmarks

```bash
node scripts/bench/file-copy.mjs
node scripts/bench/pty-throughput.mjs
```

The PTY script uses **node-pty** from plain Node (not the Electron runtime).

## Project layout

- `src/main/` — Electron main process, IPC, `app://` handler, workers, PTY, browser views, archives, store.
- `src/preload/` — `contextBridge` API.
- `src/renderer/` — React shell UI.
- `src/shared/` — types shared across main/preload/renderer.

## Local planning docs

The **`.plans/`** directory is **gitignored** (agent / local notes only). If you keep a copy there, filenames are up to you; nothing in the repo depends on it.
