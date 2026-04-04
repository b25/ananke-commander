# PTY throughput benchmark (manual)

Run the packaged app, open **two terminal** panes, then in one run:

```bash
# macOS / Linux — large output
base64 /dev/urandom | head -c 5000000 | base64 -d > /dev/null
# or
yes | head -n 200000
```

Observe CPU use of the main process and UI smoothness while scrolling.

Record: wall time, approximate main-process CPU %, and whether the xterm scrollback feels janky.

If the main process pegs a core or the UI stutters, capture a **Performance** profile in DevTools and consider:

- Lowering default scrollback
- Throttling PTY → renderer writes
- A native/Rust sidecar only if profiling shows the JS bridge is the bottleneck
