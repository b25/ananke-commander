# Ananke Commander — Performance & Polish

## What This Is

Ananke Commander is an Electron-based multi-pane workspace app combining a file browser, terminal, embedded browser, and notes editor in a single dark-themed desktop UI. This milestone focuses on making it fast and polished: eliminating performance bottlenecks across file browsing, terminal rendering, and startup, while tightening the dark theme and reorganizing the UI for better ergonomics.

## Core Value

Every pane responds instantly — the workspace feels native, not Electron-heavy.

## Requirements

### Validated

- ✓ Multi-pane workspace (file browser, terminal, browser, notes) — existing
- ✓ File operations with worker thread isolation (copy, move, delete, archive) — existing
- ✓ PTY terminal via node-pty + xterm.js — existing
- ✓ Embedded browser panes with session isolation (WebContentsView) — existing
- ✓ Markdown notes editor — existing
- ✓ Persistent workspace layout via electron-store — existing
- ✓ Workspace rail + pane grid layout — existing

### Active

- [ ] File browser renders large directories without jank (virtualized list)
- [ ] Terminal input/output latency is imperceptible (xterm.js WebGL renderer, optimized IPC)
- [ ] App startup time reduced (lazy loading, deferred init)
- [ ] UI interactions feel smooth (CSS animations performant, no layout thrashing)
- [ ] Dark theme uses consistent design tokens (CSS custom properties, unified spacing/typography)
- [ ] Button and menu layout audited and reorganized for ergonomics
- [ ] Pane controls, workspace rail, and context menus restructured based on audit findings

### Out of Scope

- New features (new pane types, cloud sync, search) — feature work is a separate milestone
- Dependency swaps (no replacing xterm.js, node-pty, Electron version) — stability constraint
- Automated test suite — tracked separately, not part of this milestone
- Redesign (no new visual direction) — refining the existing dark theme only

## Context

Brownfield Electron app. Codebase map completed — key issues identified:
- `FileBrowserPane.tsx` is 496 lines with no list virtualization
- xterm.js may not be using WebGL renderer (slower canvas fallback)
- CSS animations run unconditionally (not respecting `prefers-reduced-motion`)
- Full state serialization on every change (electron-store write overhead)
- DevTools enabled unconditionally (startup overhead in production)
- No CSS design token system — values scattered across component CSS files
- Folder size calculation blocks render thread
- Zero test coverage (risk: regressions during refactor)

## Constraints

- **Feature parity**: No regressions — everything working now must keep working
- **Dependencies**: Core libs (xterm.js, node-pty, Electron) stay as-is
- **Approach**: Audit UX layout first, then implement changes — no blind reorganization

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Performance before polish | User-stated priority | — Pending |
| Virtualize file list | Directory rendering is the main sluggishness source | — Pending |
| Refined dark theme only (no redesign) | User explicitly chose this | — Pending |
| UX audit before restructure | Avoid moving things blindly | — Pending |

---
*Last updated: 2026-04-05 after initialization*
