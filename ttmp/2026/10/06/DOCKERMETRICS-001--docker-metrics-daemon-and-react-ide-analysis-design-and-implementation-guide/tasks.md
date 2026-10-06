# Tasks

## TODO

### Phase 1 — Docker client and collector
- [x] `pkg/docker/host.go`: parse `unix://`, `tcp://`, `ssh://`, default local socket.
- [x] `pkg/docker/client.go`: Go client wrapper (net/http + ssh), fakeable via the `collector.Source` interface.
- [x] `pkg/docker/normalize.go`: CPU/mem/net/io/pids arithmetic (§6 of the design doc).
- [ ] Capture cgroup v1 and v2 stats fixtures under `testdata/docker/`.
- [x] `pkg/store/`: per-container ring buffer + `Store` interface.
- [x] `pkg/collector/`: poll list + stats + events, concurrency semaphore, timeouts.
- [x] `pkg/cli/poll.go`: one-shot and streaming output (table/json).

### Phase 2 — Metric DSL on the backend (go-go-goja)
- [ ] `pkg/runtime/module/`: native `dockermetrics` module (`containers`, `samples`, `now`, `limit`, `emit`, `console`).
- [ ] `pkg/runtime/prelude/engine.js`: port the prototype `DM` engine to the store.
- [ ] `pkg/runtime/manager.go`: factory + per-dashboard runtime pool + prelude initializer.
- [ ] `pkg/runtime/run.go`: run/interrupt a dashboard with top-level await.
- [ ] Runtime integration tests running all 21 presets against a fake store.
- [ ] `docker-metrics run` / `check` commands.

### Phase 3 — WebSocket hub + live dashboard
- [ ] `pkg/hub/`: hub, client read/write pumps, protocol frames, backpressure.
- [ ] Implicit hub sink publishing `stream()` frames to WS topics.
- [ ] `pkg/httpapi/server.go` + `pkg/cli/serve.go`; `/healthz`, container/host endpoints.
- [ ] Frontend: Fleet + Charts wired to `/ws` and `/api/v1/*`.
- [ ] Embed the Vite build into the binary via `go:embed`.

### Phase 4 — IDE mode
- [ ] `POST /api/v1/run` and `POST /api/v1/run/{id}/stop`.
- [ ] Runtime pool keyed by run id; interrupt on stop/re-run.
- [ ] Frontend: editor, console, preset drawer, dashboards CRUD.
- [ ] `pkg/dashstore/`: SQLite (modernc, cgo-free) persistence of definitions.

### Phase 5 — Prometheus + hardening
- [ ] `prometheus()` sink into `prometheus/client_golang`; `/metrics`.
- [ ] Collector self-metrics.
- [ ] Real rule actions gated behind `--allow-mutations`.
- [ ] Resource limits, logging (logcopter), graceful shutdown.
- [ ] Packaging: `make build-bin`, GoReleaser snapshot, embed verification.

## DONE

- [x] Create ticket DOCKERMETRICS-001 and initialize docmgr workspace.
- [x] Import `dockermetrics-ide.html` into `sources/local/`.
- [x] Write the intern analysis/design/implementation guide (`design-doc/01-…`).
- [x] Write the system reference (`reference/01-…`) and Docker API notes (`reference/02-…`).
- [x] Write the build/run/test playbook (`playbook/01-…`).
- [x] Write the implementation diary (`log/01-…`).
- [x] Scaffold the local repository from `go-go-golems/go-template` and normalize it.
