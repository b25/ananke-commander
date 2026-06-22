# Roadmap - Deep Review Remediation Queue

Prioritization formula: `(severity x user impact) / implementation effort`.

Effort scale:
- `S` <= 1 hour
- `M` <= half day
- `L` <= 2 days
- `XL` > 2 days

## Status — re-verified against source 2026-06-22

This queue predates a hardening pass; most items are now DONE in the codebase. A line-by-line
re-verification found:

- **Security — all DONE:** S1 (`app://` containment via `resolvePathUnderRendererRoot`), S2
  (`isNavigationAllowed` validates scheme/protocol/host; general browsing via search is by
  design), S3 (`resolveWithinVault` containment), S4 (`browser:openDevTools` gated on
  `!isPackaged`).
- **Correctness — all DONE:** C1 (fs read/write/rename all `resolve()`), C2 (`useXterm`
  `spawnedPanes` cleared on teardown), C3 (NotesPane undo pushes prior body + syncs), C4 (App.tsx
  reconciliation is effect-only), C5 (empty-dir keyboard guard; Ctrl/Cmd-click toggles via
  `togglePaths`), C6 (archive unpack defaults to active dir; FileEditor dirty-guard), C7
  (api-toolkit history synced after send), **C8 (gRPC stream send now resolves `{{vars}}` via
  `subStr` — fixed 2026-06-22)**, C9 (proto cache keyed by SHA-256; `invalidateCache` wired),
  C10 (all HTTP body modes; response capped at 10 MB), C11 (folder-size cancel emits a terminal
  "Cancelled" error so the manager cleans up).
- **Performance — all DONE:** P1 (ResponseViewer virtualizes large JSON), P2 (mock-hit writes
  debounced 300 ms), P3 (HAR capped at 1000 entries / 2000 pending), P4 (`fs:listDir`/`findFiles`
  use bounded concurrency).
- **Modularity — mostly DONE:** M1 (browser + fs + api-toolkit IPC extracted into
  `src/main/ipc/*` registrars; the `state:*` handlers still live in `index.ts`),
  M2 (App.tsx 635→264, FileBrowserPane 824→657, BrowserPaneManager split into history/HAR
  services; `getSnapshot()` made a cheap read).

Remaining genuinely-open work is the **Later (UX + Quality)** tier below (U1 accessibility,
U2 shell upgrades, Q1 broader regression tests) and the **Backlog**.

## Now (Security + Correctness)

| ID | Priority | Area | Item | Files | Effort | Acceptance criteria |
|---|---|---|---|---|---|---|
| S1 | P0 | Security | Harden `app://` file resolution containment | `src/main/protocol/registerAppProtocol.ts` | M | Requests cannot read any file outside renderer dist root; traversal test cases return 404 |
| S2 | P0 | Security | Align browser navigation policy with product intent (enforce allowlist or intentionally remove it) | `src/main/security/browserSecurity.ts`, docs | M | Runtime behavior and documentation match; policy is testable and explicit |
| S3 | P0 | Security | Enforce vault-root containment for notes read/delete operations | `src/main/notes/notesService.ts` | M | Attempts to escape vault path are rejected; valid note operations remain functional |
| S4 | P1 | Security | Gate guest browser DevTools in packaged builds | `src/main/index.ts`, `src/main/browser/browserPaneManager.ts` | S | DevTools open IPC is blocked unless explicit dev mode is enabled |
| C1 | P0 | Correctness | Normalize/resolve fs write and rename paths consistently | `src/main/index.ts` | S | `readUtf8`, `writeUtf8`, and `rename` use consistent path normalization behavior |
| C2 | P0 | Correctness | Fix `useXterm` lifecycle/respawn semantics and pane tracking | `src/renderer/panes/terminal/useXterm.ts` | M | CWD/lifecycle changes do not leak or reuse stale PTYs; spawn state remains consistent |
| C3 | P0 | Correctness | Repair NotesPane undo/local sync behavior | `src/renderer/panes/notes/NotesPane.tsx` | M | Undo always reverts to expected prior text and UI state stays in sync with persisted pane state |
| C4 | P0 | Correctness | Remove render-phase IPC side effects and add async race guards in app shell | `src/renderer/app/App.tsx` | M | No state mutation from render body; async workspace effects are sequence-safe |
| C5 | P0 | Correctness | Fix file-browser side targeting + empty-dir keyboard handling + ctrl-toggle semantics | `src/renderer/panes/file-browser/FileBrowserPane.tsx`, `src/renderer/panes/file-browser/FileList.tsx` | M | Context menu applies to clicked pane, empty lists are keyboard-safe, Ctrl/Cmd click toggles selection |
| C6 | P1 | Correctness | Make archive unpack destination explicit/safe and add FileEditor dirty-close guard | `src/renderer/panes/file-browser/ArchiveDialog.tsx`, `src/renderer/panes/file-browser/FileEditor.tsx` | M | Unpack cannot silently target process cwd; closing editor with unsaved edits prompts user |
| C7 | P0 | Correctness | Sync API-toolkit history immediately after successful HTTP send | `src/renderer/api-toolkit/components/RequestEditor.tsx`, `src/renderer/api-toolkit/store/index.ts` | S | New request appears in history without reload |
| C8 | P0 | Correctness | Fix gRPC stream cleanup and variable substitution in stream mode | `src/renderer/api-toolkit/components/GrpcPanel.tsx` | S | Closing active stream tab cancels stream; stream sends use resolved variables |
| C9 | P0 | Correctness | Replace gRPC text cache key strategy and wire invalidation lifecycle | `src/main/api-toolkit/grpc-engine.ts` | M | Different proto text payloads cannot collide; stale cache is invalidated appropriately |
| C10 | P0 | Correctness | Implement complete HTTP body mode handling + response-size safety cap | `src/main/api-toolkit/http-client.ts`, contracts/UI if needed | L | All declared body modes are handled and oversized responses are safely truncated/streamed |
| C11 | P1 | Correctness | Emit explicit folder-size cancelled terminal event | `src/main/workers/folderSizeWorker.ts`, `src/main/jobs/folderSizeManager.ts` | S | Cancelled jobs emit deterministic completion state and UI subscriptions close cleanly |

## Next (Performance + Modularity)

| ID | Priority | Area | Item | Files | Effort | Acceptance criteria |
|---|---|---|---|---|---|---|
| P1 | P1 | Performance | Virtualize / lazy-expand large JSON response rendering | `src/renderer/api-toolkit/components/ResponseViewer.tsx` | M | Large JSON payloads remain responsive and do not freeze renderer |
| P2 | P1 | Performance | Debounce mock hit persistence writes | `src/renderer/api-toolkit/store/index.ts` | S | High-frequency route hits do not cause per-hit disk writes |
| P3 | P1 | Performance | Bound HAR memory growth (cap/rotate/export strategy) | `src/main/browser/harCapture.ts` | M | Long HAR sessions keep memory within configured limit |
| P4 | P2 | Performance | Add bounded concurrency to `fs:listDir` and `fs:findFiles` | `src/main/index.ts` | M | Large directories do not trigger unbounded stat fanout |
| M1 | P1 | Modularity | Split monolithic IPC registration into domain registrars | `src/main/index.ts`, new `src/main/ipc/*` modules | L | `index.ts` is reduced to bootstrap/wiring; domain handlers are isolated and testable |
| M2 | P2 | Modularity | Decompose `App.tsx` and `FileBrowserPane.tsx` into hooks/components | `src/renderer/app/App.tsx`, `src/renderer/panes/file-browser/FileBrowserPane.tsx` | XL | Each file has clearly separated state orchestration vs presentation logic |

## Later (UX + Quality)

| ID | Priority | Area | Item | Files | Effort | Acceptance criteria |
|---|---|---|---|---|---|---|
| U1 | P2 | Accessibility | Baseline keyboard/ARIA compliance for pane menus/dialogs/list controls | renderer layout + pane components | L | Critical controls are keyboard reachable and expose correct semantics to assistive tech |
| U2 | P3 | UX | Add prioritized shell usability upgrades (command palette, global find, theme controls) | renderer app/layout modules | XL | New global productivity actions are discoverable and documented |
| Q1 | P2 | Quality | Add regression tests for security/correctness hotspots | test setup + targeted modules | L | Automated tests cover path containment, pane lifecycle races, and API-toolkit stream/history behavior |

## Backlog

- Clarify whether embedded browser is intentionally general-purpose or allowlisted.
- Determine secret storage strategy for API toolkit environments (`isSecret`: plaintext vs OS keychain).
- Evaluate multi-window support requirements.
- API toolkit parity backlog: collection runner, scripts/assertions, cookie jar, GraphQL/WebSocket, OAuth2 helper.
- File-browser parity backlog: drag/drop, richer context menus, quick preview, improved status/metadata surfaces.

## Deliberately deferred — do not do blind (needs measurement / decision)

The safe, shippable improvement backlog is exhausted (see `.plans/2026-06-22-improvement-spec.md`
for what shipped). What remains is exactly the set that should NOT be auto-implemented:

- **FU-RENDER-CASCADE** — needs a React Profiler. Its correct fix is entangled with the
  full-snapshot state architecture (every `setSnap` replaces the snapshot, so panes get fresh
  per-render objects that defeat `React.memo`). Doing it without measurement risks staleness bugs
  for an unprovable gain. Approach: run the app, profile with React DevTools, then target the
  memoization (stabilize pane identity + callbacks) and re-measure.
- **delta / slice state IPC** — explicit non-goal. Replacing full-snapshot request/response needs
  renderer-side merge logic + revision tracking (high risk); full-snapshot is correct and not the
  proven bottleneck.
- **React Compiler trial** — exploratory; a build-config + lint change that must be validated
  against the whole tree on its own branch before removing any manual memoization.
- **electron-store write batching** — non-trivial, low ROI.
- **Playwright `_electron` E2E** — heavy CI infra; the unit suite (75 tests) + the CI workflow
  (`.github/workflows/ci.yml`) cover the baseline.

