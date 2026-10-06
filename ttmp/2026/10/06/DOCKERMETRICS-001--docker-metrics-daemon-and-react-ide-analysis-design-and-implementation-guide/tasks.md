# Tasks

## TODO

### Phase 1 — Docker client and collector
- [x] `pkg/docker/host.go`: parse `unix://`, `tcp://`, `ssh://`, default local socket.
- [x] `pkg/docker/client.go`: Go client wrapper (net/http + ssh), fakeable via the `collector.Source` interface.
- [x] `pkg/docker/normalize.go`: CPU/mem/net/io/pids arithmetic (§6 of the design doc).
- [ ] Capture cgroup v1 and v2 stats fixtures under `testdata/docker/` (unit structs cover it today).
- [x] `pkg/store/`: per-container ring buffer + `Store` interface.
- [x] `pkg/collector/`: poll list + stats + events, concurrency semaphore, timeouts.
- [x] `pkg/cli/poll.go`: one-shot and streaming output (table/json).

### Phase 2 — Metric DSL on the backend (go-go-goja)
- [x] `pkg/runtime/module/`: native `dockermetrics` module (`containers`, `samples`, `now`, `limit`, `emit`, `console`, `publish`).
- [x] `pkg/runtime/prelude/engine.js`: port the prototype `DM` engine to the store.
- [x] `pkg/runtime/manager.go`: factory + per-dashboard runtime pool + prelude initializer.
- [x] `pkg/runtime/run.go`: run/interrupt a dashboard with top-level await.
- [x] Runtime integration tests over a fake store (reads, pipes, predicates, history, streams, errors, mutations gating).
- [x] `docker-metrics run` / `check` commands.

### Phase 3 — WebSocket hub + live dashboard
- [x] `pkg/hub/`: hub, client read/write pumps, protocol frames, backpressure.
- [x] `ws(topic)` sink publishing `stream()` frames to WS topics.
- [x] `pkg/httpapi/server.go` + `pkg/cli/serve.go`; `/healthz`, container/host endpoints.
- [x] Frontend: Fleet + Charts wired to `/ws` and `/api/v1/*`.
- [x] Embed the Vite build into the binary via `go:embed`.

### Phase 4 — IDE mode
- [x] `POST /api/v1/run` and `POST /api/v1/run/{id}/stop`.
- [x] Run sessions streaming `log`/`frame`/`run` frames to `run:<id>`.
- [x] Frontend: editor, console, preset drawer, atomic-design components, RTK Query.
- [ ] `pkg/dashstore/`: SQLite (modernc, cgo-free) persistence (currently in-memory).
- [ ] Dashboard save/load UI wired to the dashboards endpoints.

### Phase 5 — Prometheus + hardening
- [x] `prometheus()` sink into a registry; `/metrics` exposition.
- [x] Real rule actions wired to the Docker client, gated behind `--allow-mutations`.
- [ ] Collector self-metrics (`docker_metrics_scrape_duration_seconds`, …).
- [ ] Resource limits: per-script interrupt/watchdog budget.
- [x] Packaging: `make build-bin` / `make build-all`, embedded frontend verified.
- [ ] GoReleaser snapshot validation and first tag (needs release infra).

## DONE

- [x] Create ticket DOCKERMETRICS-001 and initialize docmgr workspace.
- [x] Import `dockermetrics-ide.html` into `sources/local/`.
- [x] Write the intern analysis/design/implementation guide (`design-doc/01-…`).
- [x] Write the system reference (`reference/01-…`) and Docker API notes (`reference/02-…`).
- [x] Write the build/run/test playbook (`playbook/01-…`).
- [x] Write the implementation diary (`log/01-…`).
- [x] Scaffold the local repository from `go-go-golems/go-template` and normalize it.
- [x] Push the repository to `wesen/2026-10-06--docker-metrics`.
- [x] Upload the intern guide to reMarkable.
