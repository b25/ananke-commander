# Architecture gates (performance)

These checks decide whether to add a **native helper** for file trees or archives.

## File copy (many small files)

```bash
node scripts/bench/file-copy.mjs
```

If wall time on a representative laptop is acceptable for your target (e.g. &lt; a few seconds for ~2k × 256 B files), **stay on Node `fs` + workers** in Electron.

## File copy (large single file)

Copy a **5–20 GB** file on the same disk and across volumes inside the app (F5 to another file-browser pane). Confirm:

- Progress updates do not freeze the shell
- Cancel (if implemented) leaves no inconsistent half-state

## PTY flood

See `scripts/bench/pty-throughput.md`.

## When to add a native sidecar

Add a small Rust/Go (or CLI) helper only when **fresh profiles** show:

- JS or IPC overhead dominates measured time, or
- You need OS-specific fast paths (e.g. `clonefile` on APFS) that are awkward in Node.

Until then, prefer **worker threads**, **bounded concurrency**, and **honest progress UI**.
