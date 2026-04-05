# Code Conventions — Ananke Commander

## File Naming
- React components: `PascalCase.tsx` (e.g., `FileBrowserPane.tsx`, `TerminalPane.tsx`)
- Utilities / managers: `camelCase.ts` (e.g., `terminalManager.ts`, `fileJobManager.ts`)
- Shared types: `contracts.ts` in `src/shared/`
- IPC handlers grouped by domain in `src/main/ipc/`

## TypeScript
- Strict mode enabled, ES2022 target
- Shared IPC types defined in `src/shared/contracts.ts` — used by both main and renderer
- `satisfies` operator used for runtime-safe type validation
- No barrel files (`index.ts` re-exports) — explicit imports preferred
- JSDoc comments on public API functions with parameter constraints documented

## Formatting
- 2-space indentation
- No semicolons
- Async/await throughout; `void` keyword used for fire-and-forget calls

## Naming Conventions
- Functions: `camelCase` except React components (`PascalCase`)
- Constants: `UPPER_SNAKE_CASE` for module-level config values
- IPC channels: `kebab-case` strings defined as constants in `src/shared/contracts.ts`
- CSS classes: `kebab-case` (e.g., `file-browser-pane`, `workspace-rail`)

## Error Handling
- User-facing errors: `try-catch` blocks with `alert()` or toast notification
- Background/cleanup errors: silent `catch` (swallowed intentionally)
- IPC errors returned as structured `{ error: string }` objects, not thrown
- Main process managers use `console.error` for diagnostic logging

## React Patterns
- Functional components only (no class components)
- Props typed with inline `interface` definitions co-located with component
- State lifted to `App.tsx` and passed down as props — no context API in use
- Pane components receive full state + IPC API object as props
- Event handlers defined inline or as named functions within component body

## IPC Pattern
- All renderer→main communication via `window.electronAPI` (contextBridge)
- Preload (`src/preload/index.ts`) exposes typed API surface via `contextBridge.exposeInMainWorld`
- Main process handlers registered in `src/main/ipc/` modules
- Bidirectional: main→renderer via `BrowserWindow.webContents.send()`

## Module Organization
- `src/main/` — Electron main process (managers, IPC handlers, entry)
- `src/renderer/` — React UI (components, hooks, styles)
- `src/preload/` — Electron preload script
- `src/shared/` — Types shared across process boundaries
- `src/workers/` — Worker thread scripts for CPU-intensive tasks

## CSS Conventions
- Component-scoped CSS files co-located with component (e.g., `FileBrowserPane.css`)
- Global styles in `src/renderer/app/` or `index.css`
- No CSS-in-JS; plain CSS files imported in component
- CSS custom properties (`--var-name`) used for theming

## Comments
- JSDoc on exported functions and class methods
- Inline comments for non-obvious logic or Electron-specific workarounds
- TODO/FIXME comments present but not tracked in issue system
