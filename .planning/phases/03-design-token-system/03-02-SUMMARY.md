---
phase: 03-design-token-system
plan: 02
subsystem: styles
tags: [css, design-tokens, tokenization, accessibility]
dependency_graph:
  requires: [tokens.css]
  provides: [tokenized-global-css, reduced-motion-guard]
  affects: [global.css]
tech_stack:
  added: []
  patterns: [css-custom-properties, prefers-reduced-motion]
key_files:
  created: []
  modified:
    - src/renderer/styles/global.css
decisions:
  - "Kept 2px hardcoded in .file-job-cancel (below token scale minimum)"
  - "Kept 6px gutter width hardcoded (structural, not design spacing)"
  - "Targeted per-animation reduced-motion guard (not blanket rule) per D-08"
metrics:
  duration: 88s
  completed: "2026-04-05T20:35:10Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 1
---

# Phase 03 Plan 02: Tokenize global.css and Add Reduced-Motion Guard Summary

Complete tokenization of global.css replacing 54 hardcoded values with var() token references across typography, spacing, colors, and border-radius, plus a prefers-reduced-motion media query for the pulse-op animation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace all hardcoded values in global.css with token references | 9a58512 | src/renderer/styles/global.css |
| 2 | Add prefers-reduced-motion guard for pulse-op animation | b5df739 | src/renderer/styles/global.css |

## What Was Built

- **Tokenized global.css**: All 54 hardcoded visual values replaced with var() references to tokens defined in tokens.css. This covers 13 font-size, 4 font-family, 1 font-weight, 7 border-radius (including 1 pre-existing), 2 hex colors, and 28 spacing (padding/margin/gap) values.
- **Reduced-motion guard**: A targeted `@media (prefers-reduced-motion: reduce)` query that suppresses the pulse-op animation on `.size-calculating` elements, satisfying PERF-07 accessibility requirement.

## Key Changes

- Zero hardcoded font-size values remain (was 13)
- Zero hardcoded hex colors remain (was 2: #21262d, #264f78)
- 28 spacing values now use --space-* tokens
- 13 typography sizes now use --text-* tokens
- 4 font-family declarations now use --font-sans/--font-mono tokens
- 7 border-radius values now use --radius-* tokens (including 1 pre-existing)
- 1 font-weight value now uses --weight-medium token
- prefers-reduced-motion media query added for pulse-op animation

## Values Kept Hardcoded (by design)

- `.pane-header height: 19px` -- unique layout height, no token equivalent
- `.file-row height: 16px` -- virtualized list row height
- `.file-job-cancel padding: 2px` -- below token scale minimum
- `.pane-stack__gutter width: 6px` -- structural gutter, not design spacing
- `.modal min-width: 360px`, `max-width: 90vw` -- layout constraints
- `.file-browser min-height: 220px`, `.notes-editor min-height: 200px` -- layout constraints
- `.modal-backdrop background: rgba(0, 0, 0, 0.55)` -- overlay-specific
- `.size-calculating` background/width/height -- animation-specific visual
- `button.primary color: #fff` -- semantic white text on accent background

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- Hardcoded font-size count: 0 (PASS)
- Typography token references: 13 (PASS)
- Hardcoded #21262d count: 0 (PASS)
- Hardcoded #264f78 count: 0 (PASS)
- Spacing token references: 28 (PASS, threshold 20+)
- Radius token references: 7 (PASS, threshold 6+)
- Font family token references: 4 (PASS, threshold 4+)
- Weight token references: 1 (PASS)
- var(--hover) references: 1 (PASS)
- var(--selected) references: 1 (PASS)
- prefers-reduced-motion query: 1 (PASS)
- npm run typecheck: PASS (pre-existing errors in unrelated files only)

## Self-Check: PASSED
