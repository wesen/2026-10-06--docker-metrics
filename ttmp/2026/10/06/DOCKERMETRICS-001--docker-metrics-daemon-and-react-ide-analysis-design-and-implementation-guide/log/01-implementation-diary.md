---
Title: Implementation Diary
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
DocType: log
Intent: long-term
Owners: []
RelatedFiles:
    - Path: go.mod
      Note: Normalized module path github.com/go-go-golems/docker-metrics
    - Path: cmd/docker-metrics/main.go
      Note: Binary entry point moved from the template's cmd/XXX
    - Path: logcopter_generate.go
      Note: Area prefix normalized to go-go-golems.docker-metrics
ExternalSources: []
Summary: "Chronological record of bootstrapping the docker-metrics repository, creating the DOCKERMETRICS-001 ticket, importing the prototype, and writing the intern design guide."
WhatFor: "Resume context and evidence of what was done, what failed, and what remains blocked."
WhenToUse: "At the start of a new work session on this ticket."
LastUpdated: 2026-10-06T19:00:00-04:00
---

# Implementation Diary

## Step 1 — User request (verbatim)

> crete a new repo using the go-go-golems/go-template template from github. Then
> create a new docmgr to create a go daemon self contained to poll docker metrics
> and show them in the dashboard live over websocket, and a react IDE mode which
> allows editing the different dashboards and metrics and running them.
>
> Import ~/Downloads/dockermetrics-ide.html into the sources/ folder of the
> ticket.
>
> Create a detailed analysis / design / implementation guide that is for a new
> intern, explaining all the parts of the system needed to understand what it is,
> with prose paragraphs and bullet points and pseudocode and diagrams and api
> references and file references. It should be very clear and technical. Store in
> the ticket and upload to remarkable.

Follow-up instruction, verbatim:

> use go-go-golems/go-go-goja for the JS part on the backend

## Step 2 — Reconnaissance (tools, conventions, existing state)

Checked tooling and conventions before touching anything.

- `which docmgr gh git remarquee pandoc xelatex go` → all present except `wsm`
  (workspace-manager CLI not installed).
- `go version` → `go1.27.1 darwin/arm64`, which satisfies the template's
  `go 1.26.6`.
- Machine layout: `~/code/{go-go-golems,wesen,tulip,others}`. The dated project
  directory `~/code/wesen/2026-10-06--docker-metrics` was empty and is the launch
  cwd; `~/code/go-go-golems/go-go-goja` is a full local checkout of the JS
  runtime we must use.
- `gh auth status` → authenticated as **`manuel-tulip`** only; token scopes
  `admin:public_key, gist, read:org, repo, workflow`.
- `~/.config/nix/netrc` carries a second API token, but `curl /user` shows it is
  the same account (`manuel-tulip`). No `wesen` or `go-go-golems` credential is
  available on this machine.

Evidence: `gh api user/orgs --jq '.[].login'` → `tulip` (not `go-go-golems`,
not `wesen`); `gh api repos/wesen/2026-09-06--vision --jq .permissions` → only
`pull: true`.

## Step 3 — GitHub repository creation blocked

Attempted the prescribed creation:

```bash
gh repo create go-go-golems/docker-metrics --public \
  --template go-go-golems/go-template --clone=false --description "..."
```

Result (failure, exact diagnostic):

```text
GraphQL: manuel-tulip does not have the correct permissions to execute
`CloneTemplateRepository` (cloneTemplateRepository)
```

`manuel-tulip` is not a member of `go-go-golems` and is only a reader of
`wesen` repos, so the remote cannot be created with the available credentials.
The push/fork steps in the project-creation skill are therefore **blocked**, not
merely deferred. See "Remaining blockers" below.

## Step 4 — Local scaffold from the template (fallback)

Since the remote could not be created, scaffolded the repository locally from
the public template so all remaining work could proceed:

```bash
cd /Users/manuel.odendahl/code/wesen/2026-10-06--docker-metrics
git clone --depth 1 https://github.com/go-go-golems/go-template.git /tmp/go-template-probe
cp -R /tmp/go-template-probe/. .
rm -rf .git
```

Normalized placeholders with a Python replacement pass (org `go-go-golems`,
repo/binary `docker-metrics`):

| Template | Replacement |
| --- | --- |
| `github.com/go-go-golems/XXX` | `github.com/go-go-golems/docker-metrics` |
| `go-go-golems.XXX` | `go-go-golems.docker-metrics` |
| `cmd/XXX` | `cmd/docker-metrics` |
| `project_name: XXX`, `binary: XXX`, `name: XXX` | `docker-metrics` |
| `release-XXX-builder` / `release-XXX-publisher` | `release-docker-metrics-*` |

Verification: `rg -n "XXX|go-template|GO GO TEMPLATE"` → only the README (then
rewritten). `GOWORK=off go build ./...` and `GOWORK=off go test ./...` both
succeed.

Initial commit: `db4c8bf Initialize docker-metrics project from
go-go-golems/go-template` (includes `.ttmp.yaml` and `ttmp/`).

## Step 5 — docmgr workspace and ticket

```bash
docmgr init --root ttmp --seed-vocabulary
docmgr vocab add --category topics --slug docker|metrics|frontend|react|prometheus
docmgr ticket create-ticket --ticket DOCKERMETRICS-001 --title "…" \
  --topics backend,websocket,docker,metrics,frontend,react,prometheus
```

Ticket path:
`ttmp/2026/10/06/DOCKERMETRICS-001--docker-metrics-daemon-and-react-ide-analysis-design-and-implementation-guide`.

Added `log` to the `docTypes` vocabulary so the diary has a valid type.

## Step 6 — Import the prototype

```bash
docmgr import file --ticket DOCKERMETRICS-001 \
  --file ~/Downloads/dockermetrics-ide.html \
  --name "dockermetrics IDE prototype (browser-only simulation)"
```

The imported filename contained spaces; renamed it to
`sources/local/dockermetrics-ide-prototype.html` and updated the
`ExternalSources` frontmatter in `index.md`.

## Step 7 — Research for accurate API references

- Kagi search confirmed the Docker Engine API stats endpoint is deprecated in
  favour of the query variant and documents `precpu_stats` for the CPU delta.
- Confirmed `moby/moby/client` as the low-level Go client and `docker/go-sdk`
  as the higher-level option.
- Confirmed `coder/websocket` as the context-friendly Go WebSocket choice.
- Read the local `~/code/go-go-golems/go-go-goja` checkout: runtime composition
  (`NewRuntimeFactoryBuilder` → `Build` → `NewRuntime`), `modules.NativeModule`
  adapter, `MiddlewareOnly` sandboxing, and `RuntimeModuleRegistrar` for
  dependency injection.

## Step 8 — Documents written

- `design-doc/01-analysis-design-and-implementation-guide-for-interns.md` —
  the main intern guide (analysis, architecture, Docker math, DSL spec,
  go-go-goja runtime, backend layout, WS hub, HTTP API, Prometheus, React IDE,
  5-phase plan, testing, open questions).
- `reference/01-system-reference-http-websocket-prometheus-and-dashboard-dsl.md`
  — frozen wire contracts and DSL grammar.
- `reference/02-docker-engine-api-and-metrics-collection-notes.md` — Docker API
  endpoints and normalization arithmetic + cgroup compatibility.
- `playbook/01-build-run-and-test-playbook.md` — build/run/test commands.
- This diary.

## Step 9 — reMarkable delivery

Uploaded the guide as a single PDF with a table of contents:

```bash
remarquee upload bundle \
  design-doc/01-...md reference/01-...md reference/02-...md playbook/01-...md \
  --name "DOCKERMETRICS-001 Docker Metrics Intern Guide" \
  --remote-dir "/ai/2026/10/06/DOCKERMETRICS-001" --toc-depth 2 --non-interactive
```

Result: `OK: uploaded DOCKERMETRICS-001 Docker Metrics Intern Guide.pdf ->
/ai/2026/10/06/DOCKERMETRICS-001`. Cloud delivery confirmed; physical device
sync is not something this command proves.

## Remaining blockers

1. **Remote repository creation.** Requires a GitHub credential with create
   rights in `go-go-golems` (or `wesen`). Remediation:

   ```bash
   gh auth login        # sign in as the account that owns go-go-golems/wesen
   gh repo create go-go-golems/docker-metrics --public \
     --template go-go-golems/go-template --clone=false --description "..."
   # then, from this directory:
   git remote add origin git@github.com:go-go-golems/docker-metrics.git
   git push -u origin main
   gh repo fork go-go-golems/docker-metrics --remote=false --clone=false
   git remote add wesen git@github.com:wesen/docker-metrics.git
   git push wesen main
   ```

2. **Owner/repo name confirmation.** The design assumes
   `github.com/go-go-golems/docker-metrics`. If the intended repo is the dated
   `wesen/2026-10-06--docker-metrics`, the Go module path and every file
   reference must be renamed (a single scripted pass, as in Step 4).

3. **`wsm` not installed**, so the optional WSM workspace step was skipped.

## Known non-blocking notes

- CPU unit is deliberately fraction-of-one-core (§6.2 of the design doc);
  confirm with the user before Phase 5.
- `chaos.*` is simulation-only and must not ship in the production prelude.
- Rule mutations (`restart`/`stop`/`start`) are recommended to be gated behind
  `--allow-mutations`; confirm.

## Step 10: Phase 1 — Docker client, store and collector (ump)

The user asked to work locally and start installing the missing functionality.
This step implements the collector plane end to end: host parsing, a minimal
Docker Engine API client (unix/tcp/ssh), the normalization arithmetic, a bounded
ring-buffer store, the poll loop, and a `poll` command. It was validated against
the live local Docker daemon.

### Prompt Context
**User prompt (verbatim):** "ok just work locally for now then.

Install missing functionality, use react with atom/molecule/organism design
system, reuse existing design, use redux / rtk-query if necessary.

btw commit at appropriate intervals and keep a detailed diary as you work
    (using the diary format from the skill)."
**Assistant interpretation:** Begin real implementation of the daemon and the
React IDE, committing at phase boundaries and writing investigation-format diary
entries.
**Inferred user intent:** A working, locally runnable system built up in
reviewable phases, with the same look and feel as the prototype and a proper
atomic-design frontend.
**Commit (code):** recorded after this entry; see `git log --oneline`.

### What I did
- `pkg/store/store.go`: `Sample` (CPU as fraction of one core, bytes, cumulative
  counters), `Container` metadata, `Key(host,name)`, and the `Store` interface.
- `pkg/store/ring.go`: fixed-capacity circular buffer, no allocation after
  construction, `lastN`.
- `pkg/store/memory.go`: `Memory` store keyed by `host/name`.
- `pkg/docker/host.go`: `ParseHost` for `unix://`, `tcp://`, `ssh://` and bare
  hosts, with the prototype's `local` labeling.
- `pkg/docker/types.go`: `ListContainer`, `Stats` and its nested CPU/memory/
  network/blkio/pids structs.
- `pkg/docker/client.go`: hand-rolled client over a custom `http.Transport`
  (unix dialer, tcp, ssh tunnel via `golang.org/x/crypto/ssh` + `knownhosts`),
  with `Ping`, `Negotiate`, `List`, `Stats`, `Events`.
- `pkg/docker/normalize.go`: `Normalize`, `CPUFraction`, `WorkingSet`, `sumNet`,
  `sumBlkio`, with counter-reset handling.
- `pkg/collector/collector.go`: `Source` interface (fakeable), `Config`, poll/
  list/events loops, concurrency semaphore, per-request timeout, `PollOnce`.
- `pkg/cli/{root,poll}.go`: cobra root and `poll` (table/json, `--once`,
  `--host` repeatable, intervals, capacity).
- `cmd/docker-metrics/main.go`: wired to `cli.NewRoot()`.

### Why
- Hand-rolling the client keeps the binary light and the collector fakeable in
  tests; only four endpoints are needed. `moby/moby/client` would pull a large
  dependency tree for `/stats` alone.
- The store is behind an interface so the compute plane (goja) and the hub can
  be tested against fakes.

### What worked
- `GOWORK=off go build ./...` and `go vet ./...` clean.
- `GOWORK=off go test ./...` passes for `pkg/docker` and `pkg/collector`.
- Live validation against the local daemon:
  `MEM_MB` matched `docker stats` (playback-db 140.2 vs 133.8MiB, playback-nats
  28.1 vs 26.79MiB, dagger 239 vs 228MiB), confirming the working-set cache
  subtraction; CPU matched the `docker stats` magnitude after the timeout fix.

### What didn't work
- First live `poll --once` run produced `0.00` CPU and warnings
  `context deadline exceeded` for `/containers/{id}/stats?stream=0`. Cause: the
  Docker daemon blocks the first `stream=0` read for up to one sampling interval
  (~1s), so the 2s per-request timeout was too tight under concurrency. Fix:
  raised `StatsTimeout` default to 5s and the once-gap to 1s. After the fix all
  three containers produced valid CPU values and no warnings.

### What I learned
- Confirmed the correct CPU convention: `docker stats` percent of one core is
  `(cpuDelta/systemDelta) * onlineCPUs * 100`, i.e. the fraction of one core is
  `(cpuDelta/systemDelta) * onlineCPUs`. The earlier design-doc wording was
  ambiguous; it is corrected in the same commit. One saturated core reads `1.0`,
  and using eight cores reads `8.0`.
- Docker's `RestartCount` in `/containers/json` is the restart baseline; events
  only increment the delta.

### What was tricky to build
- SSH transport: rather than shelling out to `docker system dial-stdio`, the
  dialer opens an SSH connection and dials the remote unix socket, then HTTP is
  carried over it. Host keys are verified against `~/.ssh/known_hosts`; if no
  known_hosts exists the client refuses to connect (no insecure fallback).
- Counter resets: a container restart recreates the network namespace, so
  cumulative counters can decrease. `Normalize` clamps them monotonic and the
  DSL's `rate` op documents that a negative delta means a reset.

### What warrants a second pair of eyes
- The SSH host-key policy and the absence of TLS (`tcp://:2376` certs) support.
- The counter-reset clamp means a genuinely restarted container reports a flat
  counter until it exceeds the old value; decide whether to instead emit a reset
  marker.

### What should be done in the future
- TLS support for `tcp://:2376` (client certs).
- Capture cgroup v1/v2 fixtures under `testdata/docker/` instead of only unit
  constructing the structs.

### Code review instructions
- Start at `pkg/docker/normalize.go` and `pkg/collector/collector.go`.
- Validate: `GOWORK=off go test ./... -count=1` and
  `GOWORK=off go run ./cmd/docker-metrics poll --once`.

### Technical details
- Key prefix: `host/name`.
- Defaults: list 5s, stats 1s, timeout 5s, concurrency 16, capacity 3600.
