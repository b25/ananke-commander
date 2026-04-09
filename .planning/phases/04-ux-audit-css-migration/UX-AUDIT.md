# UX Audit: Ananke Commander

**Date:** 2026-04-09
**Scope:** Workspace rail, pane controls, context menus

---

## 1. Workspace Rail

**Current state:**
- 56px wide sidebar; workspace name truncated to 3 chars
- Active: accent border + glow
- "Add workspace" `+` button styled identically to workspace buttons — indistinguishable

**Issues:**
- `+` button looks like a workspace named "+" — no affordance for "creates" vs "switches"
- 3-char truncation is not useful ("Workspace 1" → "Wor")

**Recommendations (Phase 5):**
- Show workspace index (1, 2, 3…) instead of name slice
- Restyle add button with dashed border and no background

---

## 2. Pane Header Controls

**Current state:**
- 19px header: title + close (×) button
- No pane type indicator
- `needsAttention` prop exists but renders nothing visible

**Issues:**
- No way to know pane type from header alone
- `needsAttention` is silently swallowed

**Recommendations (Phase 5):**
- Add emoji icon prefix per pane type (🗂 🖥 🌐 📝 📡)
- Add small attention dot when `needsAttention` is true

---

## 3. File Browser Context Menu

**Current state:**
- No right-click context menu — all actions via toolbar or keyboard F-keys
- 44px side strip with F3/F4/F5/F6/F8 buttons inside the file browser pane

**Issues:**
- Zero discoverability — new users have no affordance for file actions
- Delete at same visual weight as Copy/Move

**Recommendations (Phase 5):**
- Add right-click context menu: Open, Read (F3), Edit (F4), Copy (F5), Move (F6), Archive, separator, Delete (F8) in red

---

## 4. Toolbar

**Current state:**
- F-key buttons always visible regardless of active pane type

**Issues:**
- F-keys irrelevant when terminal/notes is active — visual noise

**Recommendation (deferred — backlog):**
- Conditionally show F-key section based on active pane type

---

## Summary

| Area | Severity | Phase 5 Action |
|------|----------|---------------|
| Workspace rail "+" indistinguishable | Medium | Dashed border add button |
| 3-char workspace name | Low | Show index number |
| Pane header — no type indicator | Medium | Add emoji icon |
| needsAttention not shown | Low | Add attention dot |
| No file context menu | High | Add right-click menu |
| F-keys always visible | Low | Backlog |
