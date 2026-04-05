# Roadmap: Ananke Commander — Performance & Polish

## Overview

This milestone takes Ananke Commander from functional-but-sluggish to fast-and-polished. We start by eliminating the two biggest performance bottlenecks (file list virtualization and folder size calculation), then optimize terminal rendering and startup, establish a CSS design token system, audit the UX layout, and finally implement the UX improvements. Every phase delivers measurable improvement — the app should feel noticeably better after each one.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: File Browser Performance** - Virtualize file list and move folder size calculation off the render thread
- [ ] **Phase 2: Terminal & Startup Performance** - WebGL renderer, IPC batching, lazy startup, debounced state persistence
- [ ] **Phase 3: Design Token System** - CSS custom properties for colors, spacing, typography, and motion-safe animations
- [ ] **Phase 4: UX Audit & Component CSS Migration** - Document UX improvement recommendations and migrate all component CSS to tokens
- [ ] **Phase 5: UX Implementation** - Reorganize workspace rail, pane headers, and context menus based on audit findings

## Phase Details

### Phase 1: File Browser Performance
**Goal**: File browser handles large directories without jank or UI freezes
**Depends on**: Nothing (first phase)
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. User can scroll through a 5,000-entry directory without visible lag or dropped frames
  2. Opening a folder with 100k+ files does not freeze the UI — folder size calculation runs in the background with progress indication
  3. File list DOM contains only visible rows plus a small buffer, not all entries
**Plans:** 2/3 plans executed

Plans:
- [x] 01-01-PLAN.md — Virtualize FileList with @tanstack/react-virtual and extract FileEditor
- [x] 01-02-PLAN.md — Streaming folder size calculation via IPC worker and renderer Web Worker
- [ ] 01-03-PLAN.md — Manual QA verification of PERF-01 and PERF-02

### Phase 2: Terminal & Startup Performance
**Goal**: Terminal feels instant and app launches fast with no unnecessary overhead
**Depends on**: Phase 1
**Requirements**: PERF-03, PERF-04, PERF-05, PERF-06
**Success Criteria** (what must be TRUE):
  1. Terminal pane renders output using WebGL (verified in DevTools or logs), not canvas fallback
  2. Running `cat` on a large file (10MB+) in the terminal does not drop frames or lag input
  3. App startup is visibly faster — DevTools do not open in production builds, managers initialize on first use
  4. Rapid pane interactions (switching, resizing, typing) do not cause electron-store write storms — writes are batched/debounced
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — WebGL addon context-loss handler (PERF-03) + PTY output buffering with 8ms flush (PERF-04)
- [ ] 02-02-PLAN.md — StateStore debounced setSnapshot with pending patch merge (PERF-06)
- [ ] 02-03-PLAN.md — Lazy manager initialization, DevTools guard, flushSnapshot on close (PERF-05, PERF-06)

### Phase 3: Design Token System
**Goal**: All visual values flow from a single token system, and animations respect user preferences
**Depends on**: Phase 2
**Requirements**: CSS-01, CSS-02, CSS-03, PERF-07
**Success Criteria** (what must be TRUE):
  1. A single CSS file defines all design tokens (colors, spacing scale, typography scale) as CSS custom properties
  2. Typography across all panes uses consistent sizes, line heights, and font weights from the token system
  3. Spacing (padding, margins, gaps) across all pane components follows a consistent scale from tokens
  4. All CSS animations and transitions are suppressed when the user has `prefers-reduced-motion: reduce` enabled
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: UX Audit & Component CSS Migration
**Goal**: UX layout is documented with actionable recommendations, and all component CSS uses design tokens
**Depends on**: Phase 3
**Requirements**: UX-01, CSS-04
**Success Criteria** (what must be TRUE):
  1. A UX audit document exists covering workspace rail, pane controls, and context menus with specific improvement recommendations
  2. Every component CSS file references design tokens instead of hardcoded color, spacing, and typography values
  3. Visual appearance is unchanged after CSS migration (no regressions — tokens reproduce existing values)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: UX Implementation
**Goal**: Workspace rail, pane headers, and context menus are reorganized for better ergonomics based on audit findings
**Depends on**: Phase 4
**Requirements**: UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. Workspace rail provides clear affordance for switching workspaces and launching new panes — actions are discoverable without guessing
  2. Pane header controls (move, close, type-switch) are visually clean and logically grouped
  3. File browser context menu puts primary actions (open, copy, move) prominently and groups destructive actions (delete) separately with visual distinction
  4. All existing functionality still works — no feature regressions from the reorganization
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. File Browser Performance | 2/3 | In Progress|  |
| 2. Terminal & Startup Performance | 0/3 | Not started | - |
| 3. Design Token System | 0/0 | Not started | - |
| 4. UX Audit & Component CSS Migration | 0/0 | Not started | - |
| 5. UX Implementation | 0/0 | Not started | - |
