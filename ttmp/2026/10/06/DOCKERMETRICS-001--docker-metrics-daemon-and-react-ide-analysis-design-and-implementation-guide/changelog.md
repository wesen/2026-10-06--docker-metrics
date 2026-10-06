# Changelog

## 2026-10-06

- Initial workspace created

## 2026-10-06

Bootstrap docker-metrics from go-go-golems/go-template; create ticket with intern design guide, system reference, Docker API notes, playbook and diary; import the dockermetrics-ide prototype.

### Related Files

- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/cmd/docker-metrics/main.go — Binary entry point
- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/go.mod — Module path normalization

## 2026-10-06

Uploaded the intern guide bundle (design doc, system reference, Docker API notes, playbook) to reMarkable at /ai/2026/10/06/DOCKERMETRICS-001 as 'DOCKERMETRICS-001 Docker Metrics Intern Guide.pdf'.

## 2026-10-06

Phase 1: Docker host parsing, minimal Engine API client (unix/tcp/ssh), stats normalization, ring-buffer store, collector poll/events loops, and poll command. Validated against the live local daemon.

### Related Files

- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/collector/collector.go — Poll and event orchestration
- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/docker/normalize.go — CPU/memory/network/io normalization

## 2026-10-06

Phase 2: go-go-goja runtime with a dockermetrics native module, ported DSL prelude, run/check commands and runtime integration tests. Validated live against the local daemon.

### Related Files

- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/runtime/module.go — dockermetrics native module
- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/runtime/prelude/engine.js — ported DSL engine

## 2026-10-06

Phase 3: WebSocket hub with topics/backpressure, REST API, Prometheus registry, run/stop endpoints, ws(topic) sink and the serve command with graceful shutdown.

### Related Files

- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/httpapi/server.go — HTTP/WebSocket/Prometheus server
- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/hub/hub.go — WebSocket hub

## 2026-10-06

Phase 4: React + TypeScript IDE with atomic design, Redux Toolkit, RTK Query and a live WebSocket stream; embedded into the Go binary via go:embed.

### Related Files

- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/httpapi/static.go — Embedded SPA serving
- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/web/src/app/api.ts — RTK Query API client

## 2026-10-06

Phase 5: rule mutations wired to the Docker client and gated behind --allow-mutations (with a gating test); gofmt and full validation gate green.

### Related Files

- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/cli/serve.go — Gated container mutator

## 2026-10-06

Add load mode (cpu/mem/leak/mixed) plus Dockerfile and docker-compose demo fleet; fix embedded-frontend gitignore and hub frame Type labelling.

### Related Files

- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/docker-compose.yml — dockerized demo fleet
- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/load/load.go — CPU/memory workload generator

## 2026-10-06

Backfill the implementation diary to the full investigation format (Steps 2-15) and record the deferral of the custom-dashboard JS API; reverted its partial implementation.

## 2026-10-06

Import the v2 prototype (dashboard DSL + widget interpreter) and add the v2 analysis/design/implementation guide.

## 2026-10-06

Phase B: backend dashboard DSL (dashboard()/widgets) with JSON snapshot publishing over dash:<id>/dash:latest; TestDashboardSnapshot.

### Related Files

- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/runtime/module.go — publishSnapshot export
- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/pkg/runtime/prelude/engine.js — Dashboard DSL and widget compute

## 2026-10-06

Phase C: React widget interpreter (15 widget components + registry), DashboardView, /d/<id> route, IDE Dashboard tab, dashboard slice and WebSocket snapshot handling.

### Related Files

- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/web/src/organisms/dashboard/DashboardView.tsx — Dashboard renderer
- /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics/web/src/organisms/dashboard/registry.ts — Widget type registry

## 2026-10-06

Restart the demo fleet in tmux with the v2 build (collector + load fleet + live dashboard window); recorded that dashboard snapshots publish only under serve.
