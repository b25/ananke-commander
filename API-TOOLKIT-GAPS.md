# API Toolkit — Gap Analysis & Implementation Plan

Generated: 2026-04-13

## Priority 1 — Correctness Bugs (implement first)

| # | Issue | File | Fix |
|---|---|---|---|
| P1-1 | HTTP timeout never applied | `http-client.ts` | Wire `req.timeout` to AbortController |
| P1-2 | apiKey-in-query auth not applied | `http-client.ts` | Inject query param in URL |
| P1-3 | Stream messages grow unbounded | `store/index.ts` | Cap at 500, drop oldest |
| P1-4 | Proto file parse errors silently ignored | `proto-codec.ts` | Collect & surface errors |
| P1-5 | File size not limited in proto dialog | `ipcHandlers.ts` | Reject > 2MB |

## Priority 2 — High-Impact Features

| # | Feature | Components |
|---|---|---|
| P2-1 | Environment variable substitution `{{var}}` | `http-client.ts`, `grpc-engine.ts`, `ipcHandlers.ts`, `store`, `RequestEditor` |
| P2-2 | Environment editor UI (create/edit/delete vars, active env selector) | New `EnvironmentEditor` component, `Sidebar` |
| P2-3 | gRPC metadata editor in GrpcPanel | `GrpcPanel.tsx` |
| P2-4 | gRPC deadline input in GrpcPanel | `GrpcPanel.tsx`, `store` |
| P2-5 | TLS cert file picker (ca/client cert/key) | `GrpcPanel.tsx`, `ipcHandlers.ts` |
| P2-6 | Collection item rename/delete (right-click or inline) | `CollectionTree.tsx` |
| P2-7 | Save current tab to collection | `RequestEditor.tsx`, `CollectionTree.tsx` |

## Priority 3 — UX Polish

| # | Feature | Components |
|---|---|---|
| P3-1 | Cmd/Ctrl+Enter to send request | `RequestEditor.tsx`, `GrpcPanel.tsx` |
| P3-2 | Response raw/pretty toggle | `ResponseViewer.tsx` |
| P3-3 | Copy response body button | `ResponseViewer.tsx` |
| P3-4 | History search/filter bar | `HistoryList.tsx` |
| P3-5 | `{{var}}` highlighting in URL bar | `RequestEditor.tsx` |
| P3-6 | Common header autocomplete | `KvEditor.tsx` |
| P3-7 | Resizable request/response split | `AppInner.tsx` |
| P3-8 | gRPC channel reuse (connection pool) | `grpc-engine.ts` |

## Priority 4 — Import/Export

| # | Feature |
|---|---|
| P4-1 | Export collection as Postman v2.1 JSON |
| P4-2 | Import from Postman v2.1 JSON |
| P4-3 | cURL import (parse curl command → HTTP request) |
| P4-4 | cURL export (current request → curl command) |

## Priority 5 — Advanced (out of scope for now)

- Collection runner, pre/post-request scripts, OAuth2 full flow, WebSocket, SSE, multipart file upload

## Error Boundaries

All top-level pane components need `<ErrorBoundary>` wrappers — prevents one buggy request from crashing the entire pane.

## Implementation Order

Phase A (bugs): P1-1 → P1-2 → P1-3 → P1-4 → P1-5
Phase B (core features): P2-1 → P2-2 → P2-3+P2-4+P2-5 → P2-6+P2-7
Phase C (UX): P3-1 → P3-2+P3-3 → P3-4 → P3-5 → P3-6 → P3-7 → P3-8
Phase D (import/export): P4-3+P4-4 → P4-1+P4-2
