---
phase: 3
slug: design-token-system
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-05
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test framework configured in project |
| **Config file** | none |
| **Quick run command** | `npm run typecheck` |
| **Full suite command** | `npm run typecheck` + visual inspection |
| **Estimated runtime** | ~5 seconds (typecheck only) |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm run typecheck` + `npm run dev` visual check
- **Before `/gsd-verify-work`:** Full visual inspection with DevTools open + reduced-motion test
- **Max feedback latency:** ~5 seconds (typecheck)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CSS-01 | — | N/A | automated | `test -f src/renderer/styles/tokens.css` | ✅ | ✅ green |
| 03-01-02 | 01 | 1 | CSS-01 | — | N/A | automated | `npm run typecheck` | ✅ | ✅ green |
| 03-02-01 | 02 | 2 | CSS-02, CSS-03 | — | N/A | automated | `grep -nE 'font-size:\s*[0-9]+' src/renderer/styles/global.css` (expect 0 results) | ✅ | ✅ green |
| 03-02-02 | 02 | 2 | PERF-07 | — | N/A | manual | Visual: enable OS "Reduce motion", open app, confirm no pulse animation | ✅ | ⬜ pending |
| 03-02-03 | 02 | 2 | CSS-02, CSS-03 | — | N/A | automated | `npm run typecheck` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This is a pure CSS authoring phase — no test stubs, fixtures, or framework installation needed. TypeScript typecheck provides automated regression guard.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All design tokens present in `:root` | CSS-01 | CSS custom properties have no runtime test harness | Open DevTools → Elements → `:root` computed styles; verify all `--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--weight-*` tokens present |
| Typography tokens used in global.css (no hardcoded font-size) | CSS-02 | grep-based, not automated build gate | `grep -nE 'font-size:\s*[0-9]+' src/renderer/styles/global.css` → should return 0 results |
| Spacing tokens used (no hardcoded px padding/margin/gap) | CSS-03 | grep-based, not automated build gate | `grep -nE 'padding:|margin:|gap:' src/renderer/styles/global.css` → only token references remain |
| Reduced-motion suppresses pulse animation | PERF-07 | Requires OS system setting change | 1. Enable "Reduce Motion" in OS accessibility settings. 2. `npm run dev`. 3. Open app. 4. Confirm `.size-streaming` element has no visible pulse animation. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
