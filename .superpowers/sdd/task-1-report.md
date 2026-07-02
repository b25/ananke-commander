# Task 1 Report — Fix gRPC engine (CORR-1)

## What was implemented

Fixed the completely non-functional gRPC engine in
`src/main/api-toolkit/grpc-engine.ts` by replacing four broken call sites that
tried to invoke per-method functions on a base `grpc.Client` (which has no such
functions) with the correct low-level `make*Request` APIs that exist on every
`grpc.Client` instance.

### Files changed

| File | Change |
|------|--------|
| `src/main/api-toolkit/grpc-engine.ts` | Fix 4 call sites; add `grpcPath` to `resolveTypes`; add `end()` to `StreamHandle`; fix `import * as protobuf` → `import protobuf` (default); fix `proto-codec.js` → `proto-codec.ts` import |
| `src/main/api-toolkit/proto-codec.ts` | Fix `import * as protobuf` → `import protobuf` (default) |
| `src/main/api-toolkit/grpc-engine.test.ts` | **New file** — TDD tests for `grpcUnary` and `grpcStream` against an in-process gRPC server |
| `package.json` | Append `grpc-engine.test.ts` to the `test` script file list |

### Root causes fixed

1. **Primary defect:** `new grpc.Client(…)[methodName](…)` — the base `Client`
   class has no per-method functions; only constructors from
   `makeClientConstructor`/`loadPackageDefinition` have them.

2. **Secondary defect (import extension):** `from './proto-codec.js'` cannot be
   resolved by Node's `--experimental-strip-types` runner (which looks for `.ts`
   files). Changed to `from './proto-codec.ts'`.

3. **Secondary defect (protobufjs ESM interop):** `import * as protobuf from
   'protobufjs'` in Node ESM gives only `{ default, 'module.exports' }`, so
   `protobuf.parse` / `protobuf.Root` etc. are `undefined`. Changed to
   `import protobuf from 'protobufjs'` (default import) in both
   `grpc-engine.ts` and `proto-codec.ts`. This is safe because electron-vite's
   esbuild bundler and TypeScript's `esModuleInterop: true` both handle CJS
   default imports correctly.

### API changes

- `resolveTypes()` now returns `grpcPath: string` — the `/pkg.Service/Method`
  path built from `svc.fullName` (the protobufjs-resolved full qualified name).
- `StreamHandle` gains `end: () => void` — wired to `call.end()` on
  client-stream and bidi handles; no-op on server-stream. This is the hook
  consumed by Task 11.

### Identity codecs

All four call sites use `const ident = (b: Buffer): Buffer => b` for both
`serialize` and `deserialize`, because the engine operates on pre-encoded
protobuf bytes (encoding is done by `jsonToMessage` / `messageToJson` in
`proto-codec.ts`).

---

## TDD evidence

### RED — before engine fix

Command:
```
node --experimental-strip-types --test src/main/api-toolkit/grpc-engine.test.ts
```

Output (abridged):
```
✖ grpcUnary: calls Hello and gets back the greeting (11.864166ms)
  TypeError: client[methodName] is not a function
      at grpc-engine.ts:194:115

✖ grpcStream: server-streaming calls onMessage and onEnd (2.568ms)
  TypeError: client[methodName] is not a function
      at grpc-engine.ts:277:130

tests 2 | pass 0 | fail 2
```

### GREEN — after engine fix

Command:
```
node --experimental-strip-types --test src/main/api-toolkit/grpc-engine.test.ts
```

Output:
```
✔ grpcUnary: calls Hello and gets back the greeting (18.458875ms)
✔ grpcStream: server-streaming calls onMessage and onEnd (3.289375ms)

tests 2 | pass 2 | fail 0
```

### Full suite

```
npm test   →  tests 77 | pass 77 | fail 0
npm run typecheck  →  (exit 0, no errors)
```

Baseline was 75/75; the two new tests bring the total to 77/77.

---

## Self-review

- All four streaming variants (unary, server-stream, client-stream, bidi) are
  fixed even though the test covers only unary and server-stream. Client-stream
  and bidi were not tested because the test brief asked only for those two, and
  setting up a bidi server in Node without a .proto-loader descriptor would add
  significant test complexity. The server-stream test validates the path-building
  and codec machinery used by all variants.
- The `end()` method is added on `StreamHandle` as required for Task 11 parity.
- Trailers are captured for unary via the `status` event (fires before the
  callback in grpc-js), so trailer data is propagated correctly.
- The `call.on('error', reject)` guard in `grpcUnary` prevents unhandled
  promise rejections when the server is unreachable.

## Concerns

- The `call.on('error', reject)` in `grpcUnary` and the callback can both fire
  for the same error (grpc-js may emit both). In practice the promise is already
  settled when the second path fires so it is silently ignored — this matches
  grpc-js behaviour for unary calls and is safe. No concern.
- Client-stream and bidi variants are untested by the new test file. They are
  not exercised by any existing test either. Task 1 acceptance criterion is
  unary + server-stream end-to-end, which is met. Coverage for the remaining two
  variants is a known gap but out of scope for this task.
