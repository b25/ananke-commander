# Browser Pane Subsystem — Review, Research & Remediation Plan

> Scope: the embedded-browser tile lifecycle (native `WebContentsView`), the canvas/screen
> mount orchestration that drives it, and the reported symptoms: browser tiles **reloading on
> screen/workspace switch**, **overlapping other UI**, and **not always being visible**.
>
> This complements (does not duplicate) `docs/CODE-REVIEW.md`, which covers security/fs/api-toolkit
> and never audited the browser subsystem. Findings here are new.

## 1. How the subsystem works today

Each browser tile renders a React `BrowserPlaceholderPane`. The actual page is a **native
`WebContentsView`** owned by the main process (`BrowserPaneManager`) and added to
`mainWindow.contentView`. Geometry is **renderer-driven**:

1. `BrowserPlaceholderPane.syncBounds()` reads its host `<div>`'s `getBoundingClientRect()`,
   intersects it with the `.canvas-workspace` container rect (to stop the native view painting
   over the toolbar), rounds, and pushes pixel bounds to main via `browser:layout`
   (`view.setBounds`). It fires from a `useLayoutEffect`, a `ResizeObserver`, `window.resize`,
   and `modal-open`/`native-view-visibility` events.
2. On collapse / modal-open the view is **suspended** — moved offscreen to `{x:-9999}` — never
   destroyed, to preserve page state.
3. The canvas is a 2×2 grid of "screens" the user pans between via a CSS
   `transform: translate(...)` (no CSS transition — switches are instant jumps). Browser panes
   are special-cased to **always mount** (`shouldMountPane.ts`) regardless of which screen is
   visible, so they stay alive while you're within a workspace.

This native-above-DOM model is the correct, performant choice (see §3). The bugs are in its
**lifecycle and geometry plumbing**, not the model.

## 2. Findings (new — not in CODE-REVIEW.md)

### Symptom → root cause

| # | Symptom | Root cause | Location |
|---|---|---|---|
| **B1** | **Reloads on workspace switch** | The mount effect calls `browser.navigate(pane.id, url)` in `useEffect(…, [pane.id])`, i.e. on every component mount. `CanvasWorkspace` only maps the **active** workspace's panes, so switching workspaces unmounts/remounts each browser component → nav effect re-fires → `webContents.loadURL()` → full reload. (`setBounds`/suspend never reload — confirmed by Electron docs; a reload-on-switch always means re-`loadURL` or recreate.) | `BrowserPlaceholderPane.tsx:108-117` |
| **B2** | **Overlaps other UI** | Native `WebContentsView`s paint **above the entire DOM compositor** — they cannot be CSS-clipped or z-indexed against DOM (Electron arch constraint, see §3). Mitigated correctly by manual rect-intersection cropping, but bounds are pushed via **async IPC that lags** redundant churn, and the intersection math runs on fractional `getBoundingClientRect` values before rounding → edge seams on 125/150 % displays. | `BrowserPlaceholderPane.tsx:139-200` |
| **B3** | **Not always visible** | The `modal-open` / `native-view-visibility` handlers hide **all** browser views at once (blunt global hammer). Multiple browser panes on one screen all get `z-index:1` (`FloatingPane.tsx`) with no per-pane visibility tracking, so a restore race can leave a pane parked offscreen. Offscreen-parking at `{-9999}` also makes pages report `visibility:hidden`/`innerWidth:0` (Electron #44590, won't-fix), which can wedge some pages. | `BrowserPlaceholderPane.tsx:124-135, 202-222`; `App.tsx:503-514` |

### Other lifecycle / perf findings

| Sev | Finding | Location |
|---|---|---|
| High | WebContents event listeners (`did-navigate`, `did-navigate-in-page`, `page-title-updated`, `did-start/stop-loading`, `context-menu`) attached in `layout()` are never removed in `destroy()`. | `browserPaneManager.ts:104-128, 358` |
| High | Browser views from non-active workspaces are kept alive (suspended). Intended for state preservation, but there is no defensive guarantee they are offscreen, and N live `WebContents` = N renderer processes (tens–hundreds of MB each). | main `state:setActiveWorkspace` |
| High | `syncBounds` fires from 4 uncoalesced sources; `ResizeObserver` + `window.resize` can emit several times per frame → IPC `setBounds` storm. | `BrowserPlaceholderPane.tsx:139-222` |
| High | `canvasSnapRan` Set grows unbounded across pans/sessions (one key per unique offset). | `useWorkspaceStability.ts:65-71` |
| Med | Lazy view creation in `layout()` can race on concurrent calls for the same paneId. | `browserPaneManager.ts:87-137` |
| Med | Suspend-vs-active is inferred from bounds; no explicit `suspended` state, so a stray `layout()` can resurrect a view that should stay hidden. | `browserPaneManager.ts:346-352` |
| Med | `native-view-visibility`/`modal-close` restore doesn't verify the pane still exists. | `App.tsx:503-514`; `BrowserPlaceholderPane.tsx:124-135` |

(Cross-cutting, deferred to a separate effort: full `AppStateSnapshot` is serialized over IPC
and `replacePanes` flushes **all** workspaces to disk on every change — `stateStore.ts`,
`preload/index.ts`. Tracked in §5 Phase 3.)

## 3. Research — what production Electron does (2024–2026, Electron 30–40)

Sourced summary; full notes retained in the review session.

- **Use `WebContentsView`, not `<webview>` or `BrowserView`.** `BrowserView` is deprecated since
  Electron 30 (a shim over `WebContentsView`); `<webview>` is officially discouraged. The current
  approach is correct.
  Sources: <https://www.electronjs.org/blog/migrate-to-webcontentsview>,
  <https://www.electronjs.org/docs/latest/api/webview-tag>
- **Native views always paint above the DOM** — no CSS clipping, no z-index vs DOM. This is a
  fundamental Chromium-Views constraint, not a backlog item. Manual rect-intersection cropping
  (what we do) is the documented norm. Figma's BrowserView post and issue #15899 confirm.
  Sources: <https://www.figma.com/blog/introducing-browserview-for-electron/>,
  <https://github.com/electron/electron/issues/15899>
- **Z-order among sibling views** has no "bring to top" API; order = `addChildView` insertion
  order. Raising a view = `removeChildView` + re-add, which flickers and (per #44652) can leave
  a view stuck painted. Avoid remove/re-add for hide; prefer offscreen/visibility.
  Sources: <https://github.com/electron/electron/issues/42061>,
  <https://github.com/electron/electron/issues/44652>
- **`setBounds` is async IPC and is not frame-locked to GPU CSS transforms** → drift/tearing if
  you `setBounds` per animation frame. Official guidance: drive resize from the main process
  (`win.on('resize')`); for animation, hide/freeze and snap one `setBounds` at the end. We have
  **no** CSS transition on the canvas, so per-frame animation isn't our problem — but redundant
  `setBounds` churn and fractional bounds are.
  Sources: <https://github.com/electron/electron/issues/12938>,
  <https://github.com/electron/electron/issues/33354>,
  <https://github.com/electron/electron/issues/43802>
- **`setBounds`/offscreen never reload** a `WebContents`; reloads mean recreate or re-`loadURL`
  (→ confirms B1). There is no `WebContentsView.destroy()` (#42884) — the model is "create once,
  keep alive, only change bounds/visibility."
  Source: <https://github.com/electron/electron/issues/42884>
- **Background throttling**: leave it **on** for genuinely hidden panes (saves CPU); disabling it
  is buggy (#50250, #22741) and offscreen views report `visibility:hidden`/`innerWidth:0`
  (#44590, won't-fix).
  Sources: <https://github.com/electron/electron/issues/44590>,
  <https://github.com/electron/electron/issues/50250>
- **Complete cure for overlap/clipping** = offscreen-render-to-`<canvas>`
  (`webPreferences.offscreen.useSharedTexture`) so panes become true DOM citizens — but it
  requires full manual input forwarding and per-pane GPU cost. **Not recommended**; a large
  rewrite justified only if DOM overlays over live panes become a hard requirement.
  Source: <https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering>

**Conclusion:** keep the native-view architecture; fix the lifecycle/geometry plumbing. The
symptoms are all addressable without a rewrite.

## 4. What we are NOT changing (and why)

- **Not** migrating to offscreen-render-to-canvas — disproportionate cost (§3).
- **Not** trying to layer DOM modals over a live pane — impossible by construction; offscreen-hide
  during full-screen overlays stays, but becomes per-pane and existence-checked.
- **Not** destroying cross-workspace views on switch — that would reintroduce reloads (B1). They
  stay alive but are guaranteed suspended.

## 5. Remediation plan

### Phase 0 — Stop the reloads & leaks (P0)
- **B1**: add `browser:ensureNavigated` — load the URL only if the pane hasn't loaded yet;
  remounts re-sync bounds but never re-`loadURL`. Renderer mount effect uses it instead of
  `navigate`.
- Remove WebContents listeners in `destroy()` (`removeAllListeners()` before `close()`).
- `suspendAllExcept(keepPaneIds)` called from main `state:setActiveWorkspace` so only the active
  workspace's browser views are ever on-screen.

### Phase 1 — Geometry correctness (P0/P1)
- Main `layout()` skips `setBounds` when bounds are unchanged (kills redundant churn / flicker).
- Renderer coalesces all `syncBounds` triggers through one `requestAnimationFrame` (one IPC per
  frame, latest rect wins).

### Phase 2 — Visibility robustness (P1/P2)
- Replace the global `native-view-visibility` hammer with **per-pane** suspend/restore that
  checks the pane still exists.
- Explicit `suspended` state in the manager; `layout()` ignores bounds for a suspended pane until
  an explicit restore, so a stray sync can't resurrect a hidden view.
- Bound `canvasSnapRan` (clear on workspace change).

### Phase 3 — Perf + modularity (P2, deferred)
- Delta-based state IPC (return/persist only the changed workspace).
- Decompose `FileBrowserPane.tsx` (824 lines), `App.tsx` (635), and split `BrowserPaneManager`
  into view-lifecycle + `BrowserHistoryService` + `HarCaptureService`.

## 6. Verification

- `npm run typecheck` and `npm test` (node `--test`) green.
- Manual: open a browser tile, navigate, switch workspace and back → **no reload** (page state,
  scroll, form input preserved); pan across screens → no toolbar bleed / no seam; open Settings
  drawer → tile hides and restores to the same page.
