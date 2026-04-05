# Technology Stack

**Analysis Date:** 2026-04-05

## Languages

**Primary:**
- TypeScript 5.7.2 - Application code across main, preload, and renderer processes
- React 19.0.0 - UI framework for renderer process

**Secondary:**
- JavaScript (Node.js) - Runtime for main process via ES modules
- HTML/CSS - Renderer markup and styling

## Runtime

**Environment:**
- Electron 34.0.0 - Desktop application framework

**Package Manager:**
- npm (inferred from package.json)
- Lockfile: Not visible in repository structure

## Frameworks

**Core:**
- Electron 34.0.0 - Main desktop framework providing main, preload, renderer process architecture
- React 19.0.0 - UI component framework for renderer
- Vite 6.0.3 - Build tool and dev server via electron-vite
- electron-vite 3.0.0 - Electron-specific build configuration

**Testing:**
- Not detected

**Build/Dev:**
- electron-builder 25.1.8 - Application packaging and distribution for macOS and Windows
- @vitejs/plugin-react 4.3.4 - React JSX support in Vite
- electron-rebuild 3.7.1 - Native module compilation for electron

## Key Dependencies

**Critical:**
- xterm 5.5.0 (@xterm/xterm) - Terminal emulation library
- @xterm/addon-fit 0.10.0 - xterm fit addon for responsive terminal sizing
- @xterm/addon-webgl 0.18.0 - WebGL rendering acceleration for xterm
- node-pty 1.0.0 - Native PTY (pseudo-terminal) spawning and management
- electron-store 10.0.0 - Persistent state storage in electron app-data directory

**Infrastructure:**
- archiver 7.0.1 - ZIP archive creation and writing
- tar 7.4.3 - TAR archive reading and extraction
- yauzl 3.2.0 - ZIP archive extraction/parsing

## Configuration

**Environment:**
- No environment variables detected as required
- Application uses `electron-store` for persistent configuration stored in app user data directory
- Default settings defined in `src/shared/contracts.ts` with privacy, browser history, and Obsidian vault configuration

**Build:**
- `tsconfig.json`: ES2022 target, strict mode, moduleResolution: bundler
- `electron.vite.config.ts`: Dual-process build configuration
  - Main process: Node.js target with external deps plugin
  - Preload: CommonJS output format (.cjs files)
  - Renderer: React JSX + HMR on localhost:5173

**Build Targets:**
```json
{
  "appId": "com.ananke.commander",
  "productName": "Ananke Commander",
  "mac": { "category": "public.app-category.developer-tools" },
  "win": { "target": "nsis" }
}
```

## Platform Requirements

**Development:**
- Node.js (version not specified, but must support modern ES2022)
- TypeScript 5.7.2+ for type checking
- electron-rebuild dependencies for native module compilation

**Production:**
- macOS 10.13+ (uses electron, category: developer-tools)
- Windows (via NSIS installer)
- Distributed via electron-builder as packaged binaries in `release/` directory

## Scripts

**Development & Build:**
- `npm run dev` - Start dev server with hot reload
- `npm run build` - Build app and create installers via electron-builder
- `npm run build:app` - Build only (no installer generation)
- `npm run preview` - Preview built app
- `npm run typecheck` - Run TypeScript type checking without emit

**Post-Install:**
- `electron-rebuild -f -w node-pty` - Rebuild native PTY module for electron version

---

*Stack analysis: 2026-04-05*
