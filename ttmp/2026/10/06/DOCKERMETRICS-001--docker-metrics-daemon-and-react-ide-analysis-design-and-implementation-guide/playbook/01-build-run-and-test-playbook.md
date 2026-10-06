---
Title: Build, Run and Test Playbook
Ticket: DOCKERMETRICS-001
Status: active
Topics:
    - backend
    - websocket
    - docker
    - metrics
    - frontend
    - react
    - prometheus
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Command sequences to bootstrap, build, run and test docker-metrics at each implementation phase."
WhatFor: "Copy-paste recipes for the intern while implementing Phases 1–5."
WhenToUse: "Every time you build, run, or test the daemon or the frontend."
LastUpdated: 2026-10-06T14:53:30.754954-04:00
---

# Build, Run and Test Playbook

All Go commands use `GOWORK=off` so an outer `go.work` cannot leak into the
build. The repository path in this workspace is
`/Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics` (a dated project
directory); the canonical clone location per the project-creation convention is
`~/code/go-go-golems/docker-metrics`.

---

## 0. Bootstrap (already done, listed for completeness)

```bash
# Source template content, normalized module path, docmgr initialized, ticket created.
cd /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics
git log --oneline
docmgr ticket list --ticket DOCKERMETRICS-001
```

---

## 1. Everyday Go loop

```bash
cd /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics

# compile everything
GOWORK=off go build ./...

# run all tests
GOWORK=off go test ./... -count=1

# run one package's tests verbosely
GOWORK=off go test ./pkg/docker/... -run TestNormalizeCPU -v -count=1

# vet + format
GOWORK=off go vet ./...
gofmt -w $(git ls-files '*.go')

# logging metadata
make logcopter-generate
make logcopter-check
```

---

## 2. Phase 1 — collector smoke test

```bash
# one-shot poll against the local daemon, table output
GOWORK=off go run ./cmd/docker-metrics poll --host unix:///var/run/docker.sock

# JSON output (glazed)
GOWORK=off go run ./cmd/docker-metrics poll --host unix:///var/run/docker.sock \
    --output json

# compare against docker stats while it runs (CPU unit differs by core count!)
docker stats --no-stream
```

Expected: one row per running container with `cpu`, `mem`, `rx`, `tx`, `pids`.
CPU is a fraction of one core; `docker stats` shows percent of all cores. On an
8-core host, `docker stats` 35% ≈ our `0.35`.

Remote host over SSH:

```bash
GOWORK=off go run ./cmd/docker-metrics poll --host ssh://ops@prod-1
```

---

## 3. Phase 2 — run a dashboard JS file

```bash
# validate + execute a dashboard against the live store, print console output
GOWORK=off go run ./cmd/docker-metrics run testdata/dashboards/one-metric.js

# validate only (parse + compile, no execution)
GOWORK=off go run ./cmd/docker-metrics check testdata/dashboards/*.js
```

Runtime integration tests for the presets:

```bash
GOWORK=off go test ./pkg/runtime/... -run TestPresets -v -count=1
```

---

## 4. Phase 3 — serve and watch the live dashboard

```bash
# start the daemon
GOWORK=off go run ./cmd/docker-metrics serve \
    --host unix:///var/run/docker.sock \
    --listen 127.0.0.1:8080

# in another shell, verify HTTP + Prometheus
curl -s localhost:8080/healthz | jq
curl -s localhost:8080/api/v1/containers | jq 'length'
curl -s localhost:8080/api/v1/hosts | jq

# WebSocket smoke test: subscribe to the fleet topic
# (websocat: brew install websocat)
printf '{"type":"subscribe","topic":"fleet"}\n' | websocat ws://localhost:8080/ws
```

Open <http://localhost:8080/> for the live dashboard.

---

## 5. Phase 4 — IDE mode

```bash
GOWORK=off go run ./cmd/docker-metrics ide --listen 127.0.0.1:8080
# or: open http://localhost:8080/ide
```

Run a preset end to end:

```bash
RUN=$(curl -s -XPOST localhost:8080/api/v1/run \
  -H 'content-type: application/json' \
  -d '{"source":"const d=docker(); console.log(await d.containers(\"web-*\").read(cpu));"}' | jq -r .runId)
echo "run id: $RUN"
printf '{"type":"subscribe","topic":"run:%s"}\n' "$RUN" | websocat ws://localhost:8080/ws

curl -s -XPOST "localhost:8080/api/v1/run/$RUN/stop"
```

Frontend dev server (hot reload) with the daemon as API backend:

```bash
cd web
pnpm install
pnpm dev            # proxying /api and /ws to :8080 via vite.config.ts
pnpm build          # produces web/dist to embed
```

---

## 6. Phase 5 — Prometheus + packaging

```bash
curl -s localhost:8080/metrics | head -40

# snapshot build (no tag, no signing)
GORELEASER_ARGS='--skip=sign --snapshot --clean' \
GORELEASER_TARGET='--single-target' make goreleaser

# verify the embedded frontend is present in the binary
GOWORK=off go build -o ./dist/docker-metrics ./cmd/docker-metrics
./dist/docker-metrics serve --listen 127.0.0.1:8080 & sleep 1
curl -s localhost:8080/ | head -5
kill %1
```

Graceful shutdown check:

```bash
kill -TERM <pid-of-serve>
# expect: drained connections, exit 0
```

---

## 7. Test fixture capture (Phase 1)

Capture real Docker JSON to use as test fixtures:

```bash
CID=$(docker ps -q | head -1)
docker run --rm curlimages/curl >/dev/null 2>&1 || true
curl --unix-socket /var/run/docker.sock \
  "http://localhost/v1.47/containers/$CID/stats?stream=0" | jq . \
  > testdata/docker/stats-cgroup$(docker info -f '{{.CgroupVersion}}').json
```

Do this on both a cgroup v1 and a cgroup v2 host if you have them; otherwise
hand-craft the missing-key cases.

---

## 8. docmgr bookkeeping

```bash
cd /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics
docmgr task list --ticket DOCKERMETRICS-001
docmgr doc list --ticket DOCKERMETRICS-001
docmgr doctor --ticket DOCKERMETRICS-001 --stale-after 30
docmgr changelog update --ticket DOCKERMETRICS-001 --entry "…"
```
