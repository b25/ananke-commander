# Task 2 Report: Lock down main-window navigation (SEC-1 / A2)

## Status: COMPLETE

---

## Implementation Details

### Problem
The main `BrowserWindow` in `src/main/index.ts` carries a privileged preload that exposes the full `ananke` API (fs read/write/delete, `pty.spawn`, `shell.openPath`, state store). Unlike the guest `WebContentsView`s in `browserPaneManager.ts` (which have both `will-navigate` guards and `setWindowOpenHandler` denies), the main window had no navigation lock-down at all. Any top-frame navigation — via a stray `<a>` click, `window.open`, meta-refresh, or renderer bug — would deliver a remote page into the same webContents context, inheriting the full privileged preload.

### Solution

#### New module: `src/main/security/mainWindowNavigation.ts`
A pure, zero-import function `isMainWindowNavigationAllowed(url: string, isDev?: boolean): boolean` with an explicit allowlist:
- `app://` scheme: always allowed (the custom privileged SPA scheme)
- `http://localhost:5173` origin: allowed only when `isDev === true` (electron-vite dev server; the vite config hardcodes port 5173)
- Everything else: denied

#### Wiring: `src/main/index.ts`
After `BrowserWindow` creation (before `attachMainWindowStatePersistence`):

```typescript
win.webContents.on('will-navigate', (event, url) => {
  if (!isMainWindowNavigationAllowed(url, !app.isPackaged)) {
    event.preventDefault()
  }
})
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
```

#### Test: `src/main/security/mainWindowNavigation.test.ts`
7 test cases covering:
- `app://` URLs → allowed (with and without path components)
- dev-server origin → allowed when `isDev=true`, denied when `isDev=false`/omitted
- `https://` URLs → denied
- `file://` URLs → denied
- `about:blank` → denied
- empty string → denied
- `javascript:` and `data:` URLs → denied

#### `package.json`
`mainWindowNavigation.test.ts` appended to the `test` script file list immediately after `browserSecurity.test.ts`.

---

## TDD Evidence

### RED: before implementation
```
node --experimental-strip-types --test src/main/security/mainWindowNavigation.test.ts

Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../mainWindowNavigation.ts'
✖ tests 1 / pass 0 / fail 1
```

### GREEN: after implementation
```
node --experimental-strip-types --test src/main/security/mainWindowNavigation.test.ts

✔ allows app:// URLs unconditionally
✔ allows dev-server origin only when isDev=true
✔ denies https:// URLs
✔ denies file:// URLs
✔ denies about:blank
✔ denies empty string
✔ denies malformed/unusual URLs
tests 7 / suites 1 / pass 7 / fail 0
```

### Full suite GREEN
```
npm test

tests 82 / suites 10 / pass 82 / fail 0 / duration_ms 106ms
(+7 new tests; baseline was 75)
```

### Typecheck
Verified against the `deep-review-remediation` worktree (which has node_modules installed). The agent worktree has no node_modules installed so `npm run typecheck` cannot run there, but copying the new files to the remediation worktree and running `tsc --noEmit` produced zero errors.

---

## Files Changed

| File | Action |
|------|--------|
| `src/main/security/mainWindowNavigation.ts` | Created — pure guard function |
| `src/main/security/mainWindowNavigation.test.ts` | Created — 7 test cases |
| `src/main/index.ts` | Modified — import + `will-navigate` + `setWindowOpenHandler` |
| `package.json` | Modified — new test file appended to `test` script |

---

## Self-Review

- The guard is strictly allowlist-based: anything not explicitly permitted is denied. This is the correct posture for a privileged context.
- `https://localhost:5173/` is specifically tested and denied (only `http://` is the dev server).
- The `isDev` parameter defaults to `false` (undefined is treated as false via `=== true`), so omitting it in production code is safe.
- `setWindowOpenHandler(() => ({ action: 'deny' }))` blocks `window.open` calls from the renderer, closing the second escape vector.
- The guard runs on `will-navigate`, not `did-navigate`, so navigation is blocked before it happens.
- Existing `app://` reloads (hot-module replacement, deep-link navigation within the SPA) are unaffected.

## Concerns / Limitations

1. **`will-redirect` not hooked**: The guest pane guard (`browserSecurity.ts`) hooks both `will-navigate` and `will-redirect`. For the main window, `will-redirect` is unlikely to trigger (the main window doesn't load external URLs in the first place), but adding it for defence-in-depth would be a follow-up.
2. **Dev server port is hardcoded**: `http://localhost:5173` is the electron-vite default. If someone customizes the vite port, the allow check would silently fail in dev. This is acceptable for a security guard (fail-closed is the right default), but worth noting in team docs.
3. **ELECTRON_RENDERER_URL override**: The production `registerAppProtocol.ts` reads `process.env.ELECTRON_RENDERER_URL` for the dev server URL, but the guard uses the hardcoded port. In practice these match (electron-vite sets the env var to the same port), but a future refactor could pull the dev origin from the env var at startup.
