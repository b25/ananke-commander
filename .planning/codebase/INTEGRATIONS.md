# External Integrations

**Analysis Date:** 2026-04-05

## APIs & External Services

**Web Navigation:**
- Arbitrary HTTPS/HTTP URLs - Supported via internal browser pane
  - Validation: `src/main/security/browserSecurity.ts` validates all URLs before navigation
  - Protocol check: Only http:// and https:// allowed
  - Special handling: about: and data: URLs permitted for internal use
  - No external SDK required; uses Chromium renderer process

**System Integration:**
- OS Shell - Via `shell.openExternal()` for external links
- OS Dialogs - Directory picker, file save dialog via Electron dialog APIs
- Clipboard - Native clipboard access via `clipboard.writeText()`

## Data Storage

**State Persistence:**
- electron-store 10.0.0 - Local file-based JSON storage
  - Location: Platform-specific app user data directory (managed by Electron)
  - Data: `src/shared/contracts.ts` AppStateSnapshot structure
  - Contains: Workspace state, pane configurations, settings, recently-closed panes
  - Store name: `ananke-commander-state` or migrated from `totalcmd-state`
  - Implementation: `src/main/store/stateStore.ts`

**File System:**
- Local filesystem only - No cloud storage integration
- File operations via Node.js fs promises API
- Paths must be normalized and resolved for security

**Caching:**
- Terminal history - In-memory per pane, configurable max entries (default: 500)
- Browser history - In-memory per pane with persistent settings, configurable max (default: 200)
- Notes undo history - In-memory, configurable max (default: 100)
- Recently closed panes - Stored in persistent state, configurable max (default: 50)

## Authentication & Identity

**Auth Provider:**
- Not applicable - Desktop application with no user authentication
- No login system, cloud sync, or user accounts
- Local-only state management

## Monitoring & Observability

**Error Tracking:**
- None detected - No Sentry, Rollbar, or similar service

**Logs:**
- Console output only
- Dev Tools visible in development (hardcoded: `win.webContents.openDevTools({ mode: 'detach' })`)
- No centralized logging system
- No persistent log files detected

## CI/CD & Deployment

**Hosting:**
- Desktop application only - Not a web service
- Distributed via electron-builder to `release/` directory

**Package Distribution:**
- macOS: DMG or APP bundle (category: developer-tools)
- Windows: NSIS installer
- Both configured in `package.json` build section

**CI Pipeline:**
- Not detected - No GitHub Actions, CircleCI, or similar workflow files

## Environment Configuration

**Required env vars:**
- None detected - Application uses electron-store for all configuration

**Secrets location:**
- No .env files or secret management detected
- Settings stored in platform-specific user data directory by electron-store
- Obsidian vault path configured locally in settings

## Webhooks & Callbacks

**Incoming:**
- Custom app protocol handler via `electron.app.on('open-url')` 
  - Implementation: `src/main/protocol/registerAppProtocol.ts`
  - Purpose: Allow OS to launch app with `ananke://` links
  - Not documented as active webhook endpoint

**Outgoing:**
- None detected
- No external API callbacks or event subscriptions

## Archive & Compression

**Formats Supported:**
- ZIP archives - Via `archiver` 7.0.1 package
  - Create: `src/main/archive/zipAdapter.ts` - packZip()
  - Extract: unpackZip() with yauzl 3.2.0
  - Use case: File archiving in file browser

- TAR + GZIP - Via `tar` 7.4.3 package
  - Create: `src/main/archive/tarGzipAdapter.ts` - packTarGzip()
  - Extract: unpackTarGzip()
  - Use case: File archiving in file browser

**Implementations:**
- `src/main/archive/archiveService.ts` - Service facade
- `src/main/archive/pathSafe.ts` - Path sanitization for archive operations
- IPC endpoint: `archive:pack`, `archive:unpack` (exposed via preload)

## Notes & Documentation Integration

**Obsidian Vault Support:**
- Path: Configurable via `AppSettings.obsidian.vaultPath` and `subfolder`
- Default subfolder: `ananke-commander-notes`
- Implementation: `src/main/notes/notesService.ts`
- Function: `saveMarkdownToVault(vaultPath, subfolder, filename, body)`
- Format: Standard Markdown (.md files)
- Behavior: Creates subfolder if missing, saves UTF-8 encoded markdown
- IPC endpoint: `notes:saveVault` (exposed via preload)

## Terminal & PTY Integration

**Terminal Emulation:**
- xterm.js 5.5.0 - Web-based terminal emulator
  - Addons: WebGL rendering (@xterm/addon-webgl), fit/resize (@xterm/addon-fit)
  - Renderer implementation: `src/renderer/panes/terminal/TerminalPane.tsx`
  - Hook: `src/renderer/panes/terminal/useXterm.ts`

**PTY Management:**
- node-pty 1.0.0 - Native pseudo-terminal spawning
  - Manager: `src/main/pty/terminalManager.ts`
  - Supports: spawn, write, resize, dispose operations
  - IPC endpoints: `pty:spawn`, `pty:write`, `pty:resize`, `pty:dispose`
  - Events: `pty:data`, `pty:exit` (sent back to renderer)

## Security & Access Control

**Browser Pane Isolation:**
- `src/main/browser/browserPaneManager.ts` - Manages isolated WebContentsView instances
- Each pane: Separate partition (`persist:guest-{paneId}`)
- Security features:
  - Sandbox: true
  - Context isolation: true
  - Node integration: false
  - Web security: true
  - Window open handler: deny all popup requests
  - Permission handler: deny all permissions
  - Navigation guard: Only http/https protocols allowed

**URL Whitelist:**
- Currently allows all valid http/https domains
- Localhost and 127.0.0.1 initially defined as trusted but not actively enforced
- See `src/main/security/browserSecurity.ts` for security policy

---

*Integration audit: 2026-04-05*
