---
Title: Analysis, Design and Implementation Guide for Interns
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
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: cmd/docker-metrics/main.go
      Note: |-
        Binary entry point where the daemon command tree is wired
        Binary entry point for the daemon CLI
    - Path: logcopter_generate.go
      Note: |-
        logcopter area prefix for the project (go-go-golems.docker-metrics)
        logcopter area prefix go-go-golems.docker-metrics
    - Path: pkg/doc.go
      Note: Package placeholder for the reusable docker-metrics Go packages
    - Path: repo://AGENT.md
      Note: Build commands and project structure conventions
    - Path: repo://go.mod
      Note: Go module github.com/go-go-golems/docker-metrics
    - Path: repo://ttmp/2026/10/06/DOCKERMETRICS-001--docker-metrics-daemon-and-react-ide-analysis-design-and-implementation-guide/sources/local/dockermetrics-ide-prototype.html
      Note: Product specification prototype
ExternalSources: []
Summary: Intern-facing analysis, design and implementation guide for the docker-metrics daemon (Go, Docker Engine API, WebSocket, Prometheus) and its React IDE mode, with the metric DSL executed on the backend by go-go-golems/go-go-goja.
LastUpdated: 2026-10-06T14:53:30.486042-04:00
WhatFor: 'Onboard a new engineer to the docker-metrics system: what it is, how the pieces fit, and how to build it phase by phase.'
WhenToUse: Read before writing any code in this repository, and keep it open while implementing the collector, the JS runtime and the dashboard frontend.
---

# Analysis, Design and Implementation Guide for Interns

> Audience: a new engineer who has never seen this repository.
> Goal: after reading this document you can explain what the system is, why each
> part exists, and how to build it. Everything here is written so that you can
> implement it yourself in the order given by the *Implementation Plan*.
>
> You do **not** need prior Docker-internals knowledge. Every external API we
> depend on is described in the *References* sections and in the companion
> `reference/` documents of this ticket.

---

## 0. How to read this document

1. Read **§1 Executive Summary**, **§2 The Problem**, and **§3 The Prototype Is
   The Specification**. These give you the "what" and the "why".
2. Read **§4 System Overview** and **§5 Vocabulary**. Draw the boxes yourself —
   if you can reproduce the ASCII diagram from memory you understand the shape.
3. Read **§6 Docker Metrics Collection**, **§7 The Metric DSL**, and **§8 The
   go-go-goja Runtime**. These are the three hard technical cores.
4. Read **§9 Backend Layout** through **§13 React IDE**. These are the concrete
   files you will write.
5. Execute **§14 Implementation Plan** phase by phase, checking off tasks in
   `tasks.md`. Use the companion `playbook/01-build-run-and-test-playbook.md` to
   run and test the code.

Companion documents in this ticket:

| Document | What it is |
| --- | --- |
| `reference/01-system-reference-http-websocket-prometheus-and-dashboard-dsl.md` | The frozen wire contracts: HTTP endpoints, WebSocket frame shapes, Prometheus output, DSL grammar. |
| `reference/02-docker-engine-api-and-metrics-collection-notes.md` | Deep notes on Docker Engine API endpoints and the rate/percent arithmetic. |
| `playbook/01-build-run-and-test-playbook.md` | Commands to build, run, and test each subsystem. |
| `sources/local/dockermetrics-ide-prototype.html` | The browser-only prototype that defines the product's look, feel, and DSL semantics. |
| `various/01-diary.md` | Chronological record of how this design was produced. |

---

## 1. Executive Summary

**docker-metrics** is a single self-contained Go binary that answers the
question "what are my Docker containers doing right now, and what were they
doing five minutes ago?" It does three things:

1. **Collects** container metrics from one or more Docker daemons (local unix
   socket, `tcp://`, or `ssh://`) by polling the Docker Engine API and by
   listening to the Docker event stream.
2. **Computes** derived values and alerts from those raw numbers using a small
   JavaScript DSL. Every dashboard, every derived metric, and every alert rule
   is JavaScript that runs *on the backend* inside a sandboxed
   [`go-go-golems/go-go-goja`](https://github.com/go-go-golems/go-go-goja)
   runtime (goja, a pure-Go ECMAScript engine).
3. **Serves** the results two ways: a live WebSocket feed consumed by a React
   dashboard, and a Prometheus `/metrics` endpoint consumed by existing
   monitoring.

On top of that it ships **an IDE mode**: a React application where an operator
edits dashboards and metric definitions in a code editor, presses *Run*, and
silently gets a real backend goja runtime executing that code against live
container data. The IDE can save those definitions so they are loaded again on
the next start.

The interesting engineering is in three places, and they are the three places a
new engineer must understand:

- **Correct container math.** CPU percent, memory working set, and network/disk
  rates are *not* direct readings; they are differences between two samples
  divided by elapsed time or by limit. §6 walks through each formula.
- **A real JS evaluation model.** Metrics, reducers, windows, selectors,
  predicates, and rules form a typed pipeline. §7 defines it, porting the exact
  semantics of the prototype.
- **Execution of untrusted JS in Go.** §8 explains how the daemon embeds
  go-go-goja, exposes Docker-backed data through a native module, sandboxes
  execution, and isolates one dashboard's runtime from another's.

The prototype at `sources/local/dockermetrics-ide-prototype.html` is the source
of truth for the *product*. It already contains a complete, working model of the
data pipeline and the UI, implemented entirely in the browser against simulated
Docker data. Our job is to keep that UX and DSL and move the simulation behind a
real backend.

---

## 2. The Problem

An operator running a handful of Docker hosts has three questions:

- **Right now:** which containers are hot, leaking memory, restarting, or
  doing nothing?
- **Over time:** what did CPU/memory/network look like over the last hour, and
  is the trend getting worse?
- **Derived:** is *this* container burning more CPU per request than its
  neighbours? Is memory above 85% of its limit for more than three minutes?

Existing tools cover pieces of this:

- `docker stats` is interactive but not addressable, not historical, not
  composable, and not scriptable.
- Prometheus + cAdvisor is powerful but heavy, and the *authoring* experience
  (writing PromQL, choosing recording rules) is a barrier.
- Grafana dashboards are static JSON that you cannot evaluate ad hoc.

What is missing is a **lightweight, self-contained daemon** that polls Docker
directly, keeps a short in-memory history, lets an operator *write and run*
metric expressions in a familiar language (JavaScript), and streams the result
to a live dashboard — without deploying a metrics stack.

The design constraint that shapes everything: **one binary, no external
database required, and user-authored logic that does not require a recompile.**
That last constraint is exactly why the JS runtime exists, and why we use
go-go-goja rather than writing an expression evaluator in Go.

### Goals

- One binary, `docker-metrics`, with subcommands (`serve`, `poll`, `ide`,
  `check`).
- Zero third-party runtime dependency beyond a Docker socket and Go's standard
  library for HTTP/WebSocket (plus a small set of vetted modules).
- Live dashboards over a single WebSocket connection.
- A Prometheus endpoint for interoperability.
- A JS DSL for deriving metrics, and an IDE to author and run it.
- Short-term history (default 1 hour, configurable) held in memory per
  container, with optional on-disk persistence of *definitions* only.

### Non-goals (v1)

- Long-term metric storage; Prometheus or an external TSDB owns that.
- Kubernetes-aware discovery; v1 talks to Docker Engine endpoints only.
- Multi-tenant authentication and authorization. v1 is a single-operator tool
  bound to localhost or an SSH tunnel by default. §17 covers the boundary.
- Running arbitrary untrusted code from the network. The IDE is trusted-operator
  only, and the sandbox is defense-in-depth, not a public compute service.

---

## 3. The Prototype Is The Specification

Open `sources/local/dockermetrics-ide-prototype.html` (imported from
`~/Downloads/dockermetrics-ide.html`). It is a ~900-line self-contained HTML file
with React 18 (UMD) and a `<script>` block that defines two things:

1. **`DM` — the data engine** (lines ~30–670): a simulated world of 20
   containers across 4 hosts, a metric/predicate/rule/stream DSL, and a set of
   sinks (`prometheus()`, `statsd()`, `file()`, `tap()`).
2. **The React IDE** (lines ~672–910): a code editor with syntax highlighting,
   a preset drawer, a console, a fleet view, charts, an events log, and a sinks
   viewer.

The `<script>` tags at the bottom run it against **simulated** data. Nothing
touches a real daemon.

### 3.1 What the prototype gives us for free

- The **DSL surface**. Every function and method the user writes is already
  defined: `docker()`, `.container()`, `.containers()`, `.read()`,
  `.history()`, `.stream()`, `.watch()`, `cpu`, `mem`, `net.rx`, `pct`, `mb`,
  `of("limit")`, `rate("1s")`, `avg`, `p95`, `sum`, `by("label:service")`,
  `last("15m")`, `bucket("1m", avg)`, `gt(0.9)`, `sustained(p, "2m")`,
  `rule(name).when(...).then(...)`, `chaos.*`, `sleep()`, `spark()`.
- The **semantics** of that DSL (how pipes compose, what a reducer does, what a
  window means). We must reproduce these exactly, because the IDE presets in the
  prototype are our acceptance tests.
- The **UI structure**. The React tree, the CSS custom properties, the
  keyboard shortcuts (`Ctrl/Cmd+Enter` to run), the panes and tabs.
- The **preset library**. Twenty-one worked examples in `PRESETS`, grouped into
  Basics, Streaming, Aggregation, Alerts, Advanced, Scenarios, and Sandbox. Each
  is a specification of expected behavior.

### 3.2 What must change when we go real

| Prototype | Real daemon |
| --- | --- |
| `world.sims` is a fixed `SPEC` array of simulated containers. | Containers come from Docker Engine API `GET /containers/json` and are refreshed. |
| `Sim.step(t)` advances simulated time and synthesizes numbers. | A collector polls `GET /containers/{id}/stats` on a real interval. |
| `world.t` is a simulated clock advanced by `SPEEDS`. | Real wall-clock time; `now()` returns `time.Now().Unix()`. |
| `engine.tick()` is driven by a `setInterval`. | A scheduler drives periodic evaluations in Go; JS execution happens in a goja runtime. |
| `runCode()` compiles the user's code with `AsyncFunction` in the browser. | The backend compiles and runs it in a go-go-goja runtime with a native `dockermetrics` module. |
| `prometheus()`, `statsd()`, `file()` write to in-memory demo objects. | `prometheus()` registers into `prometheus/client_golang`; `statsd()` opens a UDP socket; `file()` writes to disk. |
| React bundle is loaded from a CDN at runtime. | The React app is built with Vite and embedded into the Go binary with `go:embed`. |

**Rule for the intern:** when the prototype and your intuition disagree, the
prototype wins. It has been used, it has presets, and it defines the DSL that
users will type.

### 3.3 The prototype's engine in outline

The prototype's `DM` engine is worth reading in full, but here is the map of its
objects (line numbers are approximate and refer to the HTML file):

```text
DM
├── clamp/rnd/sec/Halt            utility
├── SPEC                          the 20 simulated containers (host,name,image,labels,base stats)
├── Sim                           simulates one container; .step(t) advances it
├── world                         {t, sims[], events[], sinks{}, reset(), step(), log()}
├── engine                        {items:Set, tick(), stopAll()} — the run loop
├── ops                           map(op) / rate(op) / reduce(op)   ← the pipeline vocabulary
├── Metric                        a named data source + a list of ops; .pipe(), .is()
├── Pred                          a boolean-valued signal; .and()/.or()/.not()/.sustained()
├── selection                     matcher(sel), tree(sims, bys, leaf), by(), last(), since(), bucket()
├── Report                        .flatten() for tabular output
├── Group / Container             selectors with read/check/history/stream/watch/restart/stop/start
├── Rule / Watcher                rule(name).when(pred).then(actions).cooldown(d)
├── Stream                        .write to sinks, async-iterable, .take(n), .watch(...)
├── sinks                         prometheus(), statsd(), file(), tap()
├── Docker / fleet                docker({host}), fleet([...])
├── chaos / sleep / spark         test helpers
└── API                           the object injected into user code as globals
```

The key insight: **the API is a value graph**. `cpu` is a `Metric`. `mem.pipe(of("limit"), pct)` returns a *new* `Metric` (immutable). `cpu.is(gt(0.9))` returns a `Pred`. A `Group.read(metric)` collapses the graph to numbers. Our Go/JS design keeps the graph in JavaScript and only crosses into Go at the leaves (`Group.read`) and at the sinks.

---

## 4. System Overview

```text
                         ┌────────────────────────────────────────────────────────────┐
                         │                    docker-metrics (one binary)              │
                         │                                                            │
   Docker Engine API     │  ┌──────────────┐   raw samples   ┌────────────────────┐   │
   unix:// | tcp:// |    │  │  collector   │ ──────────────▶ │  ring-buffer store │   │
   ssh://  ────────────────▶│  (poller)    │                 │ (per container,    │   │
                         │  │  + events    │                 │  bounded, 1h)      │   │
                         │  └──────────────┘                 └─────────┬──────────┘   │
                         │                                            │              │
                         │                         ┌──────────────────▼───────────┐  │
                         │                         │  go-go-goja runtime plane    │  │
                         │                         │  ┌────────────────────────┐  │  │
                         │                         │  │ native module          │  │  │
                         │                         │  │ require("dockermetrics")│ │  │
                         │                         │  │  docker(), cpu, mem ...│  │  │
                         │                         │  └───────────┬────────────┘  │  │
                         │                         │   dashboard.js source        │  │
                         │                         │   eval → streams → sinks     │  │
                         │                         └───────┬───────────┬──────────┘  │
                         │                                 │           │             │
                         │        ┌────────────────────────┘           └────────┐    │
                         │        │ frames                                  values│    │
                         │  ┌─────▼──────┐   ┌──────────────┐   ┌──────────────▼─┐  │
                         │  │ ws hub     │   │ http api     │   │ prometheus     │  │
                         │  │ /ws        │   │ /api/v1/*    │   │ /metrics       │  │
                         │  └─────┬──────┘   └──────┬───────┘   └────────────────┘  │
                         │        │                 │                               │
                         │  ┌─────▼─────────────────▼───────────────────────────┐   │
                         │  │ embedded React IDE + dashboard (Vite build)       │   │
                         │  │  go:embed dist/  →  served at / and /ide          │   │
                         │  └───────────────────────────────────────────────────┘   │
                         └────────────────────────────────────────────────────────────┘
                                        ▲                          ▲
                                        │ WebSocket (JSON frames)  │ HTTP scrape
                                  Browser operator            Prometheus server
```

### 4.1 The three planes

- **Collector plane** — talks to Docker, produces immutable raw samples on a
  fixed cadence. Knows nothing about dashboards.
- **Compute plane** — the go-go-goja runtimes. Each active dashboard/session
  gets a runtime that can read from the store through a native module, compute,
  and emit frames into sinks.
- **Presentation plane** — the WebSocket hub and HTTP API, plus the embedded
  React app. Knows nothing about Docker.

The store is the only shared mutable state between the collector plane and the
compute plane. Keep it behind an interface (`store.Store`) so it is testable and
replaceable.

### 4.2 Why this decomposition

- **Testability.** The collector can be tested against a fake Docker API; the
  compute plane can be tested against a fake store; the hub can be tested with
  an in-memory pipe.
- **Safety.** Docker credentials and sockets stay in the collector; JS only ever
  sees numbers and metadata through the module.
- **Independent evolution.** Prometheus consumers and dashboard consumers read
  the same store but do not depend on each other.

---

## 5. Vocabulary

Read this once; it will save you from misreading the rest.

| Term | Meaning |
| --- | --- |
| **Host** | A Docker Engine endpoint, identified by a short name (`local`, `prod-1`). Parsed from `DOCKER_HOST`-style strings (`unix:///var/run/docker.sock`, `tcp://prod-3:2375`, `ssh://ops@prod-1`). In the prototype, `parseHost()` does this. |
| **Container** | A Docker container with `name`, `image`, `labels`, `host`, `state`, `restarts`. The atomic unit for polling. |
| **Group** | A live selector over containers, e.g. `containers({ label: "tier=backend" })`. Re-resolves on every use. |
| **Selector** | A string glob, a `RegExp`, a predicate function, or an object (`{ label: "app=api", image: /^node/, host: "prod-1", state: "running" }`). |
| **Sample** | One raw reading of one container at one time: `{t, cpu, mem, rx, tx, ior, iow, pids}`. |
| **Series** | An ordered slice of `{t, v}` points produced from samples by applying ops. |
| **Metric** | A named producer of a series, e.g. `cpu`, `mem`, `net.rx`, `mem.limit`. Carries an immutable list of **ops**. |
| **Op** | A pipeline step: a **map** (`pct`, `mb`, `round`), a **rate** (`rate("1s")`), or a **reduce** (`avg`, `p95`, `sum`, `max`, `count`). |
| **Reducer** | The single op that collapses many values into one (across a group, or over a window). At most one per metric. |
| **Window** | `{ window: "5m" }` after a reducer means "reduce over the last 5 minutes of this container's samples first, then across the group". |
| **Predicate (`Pred`)** | A boolean-valued signal, e.g. `cpu.is(gt(0.9))`, combine with `and/or/not/sustained`. |
| **Rule** | `rule(name).when(pred).then(action...).cooldown(d)`. Actions may `emit(event)` or mutate a container (`restart`, `stop`, `start`). |
| **Watcher** | The driver that evaluates rules against a group on every tick and fires actions with a per-rule cooldown. |
| **Stream** | A periodic evaluation of an expression producing frames; can be iterated (`for await`), tapped, or written to sinks. |
| **Sink** | A destination for frames: `prometheus()`, `statsd()`, `file()`, `tap()`, or the WebSocket hub. |
| **Frame** | `{t, data, value, container?}` — one evaluation of a stream. |
| **Store** | The backend ring buffer of samples per container. |
| **Runtime** | A go-go-goja `*engine.Runtime` (one goja VM) evaluating one dashboard's JS. |
| **Module** | A Go-backed `require()`-able object. Our module is `dockermetrics`. |
| **Dashboard** | A saved JS program plus presentation metadata (which tabs/charts to show). |
| **IDE mode** | The React UI that edits and runs dashboards/metrics (as opposed to the read-only live dashboard). |

---

## 6. Docker Metrics Collection

This section is the mathematical core. If you get these numbers wrong, every
dashboard is wrong.

### 6.1 Which Docker endpoints we use

All container data comes from the Docker Engine API (versioned, e.g. `/v1.47`).
The four endpoints that matter:

| Endpoint | Purpose | Cadence |
| --- | --- | --- |
| `GET /containers/json?all=1` | List containers with names, image, labels, state. | every 5s (or on `container` events) |
| `GET /containers/{id}/stats?stream=0` | One stats snapshot for one container. | every 1–2s per running container |
| `GET /events?filters=...` | Live stream of `start`, `die`, `restart`, `destroy`, `health_status` events. | continuous |
| `GET /info` | Daemon metadata: CPU count, memory total, kernel, cgroup version. | once at startup, then rarely |

Notes that matter:

- **Never** use `?stream=1` per container when you have many containers; that is
  one long-lived HTTP connection per container and it does not scale. Poll
  `?stream=0` on your own cadence, or use one shared streaming call only for
  small fleets.
- The API does **not** return CPU percentage. It returns cumulative counters;
  you compute the percentage from two consecutive readings.
- On cgroup v2 hosts, `blkio_stats`, `cpu_usage.percpu_usage`,
  `memory_stats.max_usage` and `memory_stats.failcnt` are not set. Do not depend
  on them. See `reference/02-...md` for the field-by-field compatibility table.
- Container IDs can be truncated in `/containers/json` (12 hex chars). Always
  poll stats with the full `Id` from the list response; keep the short id only
  for display.

### 6.2 CPU percent

Docker's stats payload has `cpu_stats` (current) and `precpu_stats` (the
reading before it). Both contain `cpu_usage.total_usage` (cumulative nanoseconds)
and `system_cpu_usage` (cumulative nanoseconds of the host), plus
`online_cpus`.

```text
cpuDelta        = cpu_stats.cpu_usage.total_usage - precpu_stats.cpu_usage.total_usage
systemDelta     = cpu_stats.system_cpu_usage     - precpu_stats.system_cpu_usage
onlineCPUs     = cpu_stats.online_cpus  ?? len(cpu_stats.cpu_usage.percpu_usage) ?? 1

cpuPercent     = (cpuDelta / systemDelta) * onlineCPUs * 100
```

The result is *percent of all host cores*. A value of `100` means one full core
on a single-core host, or 1/8 of a core on an 8-core host. The prototype models
`cpu` as a fraction of one core (`0.42` = 42% of a core), so we must decide the
canonical unit and keep it consistent.

**Decision for docker-metrics:** the store keeps CPU as **fraction of one core**
(the prototype's unit), computed as `cpuPercent / 100`. `pct` then renders it as
a percentage of one core. This matches every prototype preset. Document this in
the module docs, because mixing the two conventions is the most likely bug.

### 6.3 Memory working set

```text
usage      = memory_stats.usage
cache      = memory_stats.stats.total_inactive_file      (cgroup v1)
             OR memory_stats.stats.inactive_file        (cgroup v2)
workingSet = max(0, usage - cache)
limit      = memory_stats.limit
memPct     = workingSet / limit * 100
```

`memory_stats.usage` includes page cache, which is reclaimable and makes
containers look larger than they are. Always subtract the inactive-file cache to
get a meaningful number. The prototype stores `mem` in **bytes** and has a
separate `mem.limit` metric; that is the convention to keep.

### 6.4 Network and block I/O rates

`networks` is a map `interface -> {rx_bytes, tx_bytes}` (reclaimed when the
container stops). `blkio_stats.io_service_bytes_recursive` is a list of
`{op, value}` entries. Both are **cumulative counters**, so the value a dashboard
shows is a rate:

```text
rxRate = (rx_bytes_now - rx_bytes_prev) / (t_now - t_prev)      # bytes/sec
```

Sum across interfaces for `net.rx`/`net.tx`. For block I/O, sum `read` entries
into `io.r` and `write` entries into `io.w`.

The prototype models `rx`/`tx` as cumulative counters and applies
`rate("1s")` explicitly, so the store keeps counters and the DSL derives rates.
Keep that: it lets users compute `rate("1m")` or `rate("1h")` differently.

### 6.5 PIDs and restarts

- `pids_stats.current` is the process count; `pids_stats.limit` the cap.
- Restart counts are not in stats; get them from `/containers/json` (`RestartCount`)
  and increment from `restart`/`die`+`start` events between list refreshes.

### 6.6 The sample struct

The store's unit is a `Sample`. This is the contract between collector and
compute:

```go
// pkg/store/sample.go
type Sample struct {
    T    int64   `json:"t"`     // unix seconds
    CPU  float64 `json:"cpu"`   // fraction of one core (0.42 = 42% of a core)
    Mem  uint64  `json:"mem"`   // working-set bytes
    Limit uint64 `json:"limit"` // memory limit bytes
    Rx   uint64  `json:"rx"`    // cumulative bytes received
    Tx   uint64  `json:"tx"`    // cumulative bytes transmitted
    IoR  uint64  `json:"ior"`   // cumulative block reads
    IoW  uint64  `json:"iow"`   // cumulative block writes
    PIDs int     `json:"pids"`
    PIDsLimit int `json:"pidsLimit"`
}
```

### 6.7 Collector pseudocode

```text
function Collector.Run(ctx):
    hosts = resolveHosts(config)            # unix://, tcp://, ssh://
    for each host h:
        go eventsLoop(ctx, h)               # GET /events, long-lived
    every listInterval (5s):
        for each host h:
            list = h.GET("/containers/json?all=1")
            reconcile(store, h, list)       # add/remove containers, update state/restarts
    every statsInterval (1–2s):
        for each running container c (bounded by concurrencyLimit):
            raw = c.host.GET("/containers/" + c.ID + "/stats?stream=0")
            s   = normalize(raw, previous[c.ID])   # §6.2–6.6
            store.Append(c.ID, s)
            previous[c.ID] = raw

function eventsLoop(ctx, host):
    for ev in host.Stream("/events"):
        switch ev.Action:
            "start":   store.MarkStarted(ev.ID)
            "die":     store.MarkStopped(ev.ID)
            "restart": store.IncRestarts(ev.ID)
            "destroy": store.Remove(ev.ID)
        hub.Publish(eventFrame(ev))          # dashboards may want raw events
```

Concurrency guardrails:

- A semaphore limits concurrent `/stats` requests per host (default 16). Docker
  serializes some work; hammering it with 200 parallel stats calls will make the
  daemon slow.
- Each poll has a context timeout (default 2s). A slow container must not stall
  the whole collection tick; drop the sample and log a warning.
- The list refresh runs in its own goroutine and never blocks the stats loop.

---

## 7. The Metric DSL

This is a port of the prototype's `DM` engine. Read the prototype's lines
~150–450 alongside this section.

### 7.1 The value graph

Everything a user writes is a *value* with a type:

```text
Metric      → a series producer          e.g. cpu, mem, net.rx
Pred        → a boolean signal           e.g. cpu.is(gt(0.9))
Group       → a set of containers        e.g. docker().containers({label:"tier=backend"})
Report      → tabular history            returned by history()
Stream      → periodic frames            returned by stream()
Frame       → {t, data, value}           what sinks receive
```

`Metric` and `Pred` are **immutable**: every `.pipe(...)` or `.is(...)` returns
a new object. This matters because users store and reuse them:

```js
const memPct = mem.pipe(of("limit"), pct);   // compute once…
await docker().containers("api-*").read(memPct);   // …reuse anywhere
```

### 7.2 Ops

An op is one of three kinds:

| Kind | Examples | Effect on a series |
| --- | --- | --- |
| `map` | `pct`, `kb`, `mb`, `gb`, `round(n)`, `of("limit")`, `of(x)` | `v → f(v, sim)` pointwise |
| `rate` | `rate("1s")`, `rate("1m")` | `v_i → (v_i - v_{i-1}) / (t_i - t_{i-1}) * per` |
| `reduce` | `avg`, `sum`, `min`, `max`, `p50`, `p95`, `p99`, `count` | collapses many values into one |

Rules:

- **At most one reducer per metric** (the prototype throws otherwise). A second
  reducer is a user error; enforce it.
- A **window** may follow the reducer: `cpu.pipe(p95, { window: "5m" })` means
  "for each container, take the last 5 minutes of samples, apply `p95`, *then*
  combine across the group". Internally the op list is split at the reducer
  into `pre[]` (maps/rates) and `post[]` (maps after the reducer).
- `of("limit")` divides by the container's memory limit (or by a literal number
  if one is given). It needs the container context, hence `f(v, sim)`.

### 7.3 Series evaluation

```text
seriesOf(metric, ctx, n):
    base = []
    switch metric.src.kind:
        "base":    base = ctx.sim.hist[last n].map(pt => {t: pt.t, v: src.get(pt, ctx.sim)})
        "custom":  base = [{t: now(), v: await src.fn(wrap(ctx.sim))}]
        "combine": combine two child series pointwise via src.f
    return metric.pre.reduce((s, op) => applyOp(op, s, ctx.sim), base)
```

`valueOf(metric, ctx)` is the scalar version: if the reducer has a window, it is
`reducer(seriesOf(metric, ctx, window))`; otherwise it is the last point of
`seriesOf(metric, ctx, 2)`.

### 7.4 Selection and grouping

```text
matcher(sel):
    null            → state != "stopped"
    string          → glob(sel) matched against name
    RegExp          → matched against name
    function        → sel
    object          → AND of: name glob, label k=v, image prefix/regex, host, state

read(spec, bys...):
    sims = group.sims()
    if single (Container):       return value for that one container
    if bys:                      return tree(sims, bys, leaf)   # nested objects
    if reducer:                  return reduce(values across sims)
    else:                        return {containerName: value}
```

`by()` keys: `name`, `image`, `host`, `state`, `label:<key>`. A `label:` key that
does not exist yields `"(none)"` (never an error). An unknown key is an error.

### 7.5 Predicates

```text
cmpf(f) → comparator    gt(x) gte(x) lt(x) lte(x) eq(x) between(a,b)
metric.is(cmp)          → Pred
and(p...) or(p...) not(p)
sustained(p, dur)       → true only if p held true for ~dur, sampled
```

`Pred.eval(ctx)` returns the last boolean of its series. `sustained` requires the
window to be almost fully populated (`len(w) >= d * 0.98`) before it can fire —
this prevents a rule from firing on a freshly started daemon with no history.

### 7.6 Rules, watchers, streams, sinks

```text
watch(rules...):
    every tick, for each container in the group:
        for each rule:
            if cooldown[key] > now: continue
            if rule.pred.eval(ctx):
                if rule.cooldown: cooldown[key] = now + rule.cooldown
                for action in rule.actions: action(container, event, docker)

stream(spec, {every}, mods...):
    every `every` seconds: v = group.read(spec, mods...)
        frame = {t: now, data: {name: v}, value: v}
        for sink in sinks: sink.write(frame, stream)
        if flat: push one {t, container, value} per container to the iterator
        else:    push frame
```

### 7.7 Custom metrics and composition

```js
const pidsRatio = metric("pids-ratio", async c => {
  const { current, limit } = await c.read(pids);
  return current / limit;
});
const efficiency = div(cpu, mem.pipe(mb));   // combine two metrics
```

`metric(name, fn)` creates a custom metric whose body receives a container handle
and may `await` reads. `combine` ops (`add`, `sub`, `mul`, `div`) lift two
metrics into one.

### 7.8 How this maps onto Go + goja

The **entire DSL stays in JavaScript**. We do not reimplement `Metric`,
`Pred`, `Group`, or the ops in Go. Instead:

- Go provides the *leaves*: the container list, the samples, and the current
  time, through the native `dockermetrics` module.
- A small, **preloaded JS library** (the "engine prelude") defines `Metric`,
  `Pred`, `Group`, `Docker`, `read`, `history`, `stream`, `watch`, and all ops,
  exactly as the prototype does. It gets `require("dockermetrics")` for the
  leaves.
- User code is evaluated *after* the prelude, so every name is already in scope
  (the prototype's `with(__api){…}` trick becomes a prelude that installs globals).

This is the single most important design decision in the whole system:
**port the engine once, into JavaScript; keep Go thin.** It guarantees the IDE
presets keep working and avoids two divergent implementations of the DSL.

```text
┌─────────────────────────────── goja runtime ───────────────────────────────┐
│  prelude.js            (bundled into the binary, defines Metric/Pred/…)     │
│  require("dockermetrics")  ← native Go module: containersByHost(),          │
│                              samples(), now(), limits(), emitSink(), …      │
│  dashboard.js          (user code; evaluated with a fresh scope per run)   │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. The go-go-goja Runtime

This is the second hard core. Read the go-go-goja README and, on this machine,
the local checkout at `~/code/go-go-golems/go-go-goja`.

### 8.1 Why go-go-goja (and not a hand-written evaluator)

The product needs user-authored logic that runs against live data without a
recompile. The choices were:

1. **A Go expression language** (e.g. a small AST evaluator we write): large
   surface, constant maintenance, no ecosystem.
2. **CEL or Starlark**: good for simple expressions, poor for async streams and
   imperative rule actions.
3. **Lua**: fine, but the prototype and its presets are JavaScript.
4. **goja / go-go-goja**: pure Go, no cgo, full ECMAScript, async support, a
   native-module system, and — decisively — the prototype is JavaScript.

We chose go-go-goja because it is the go-go-golems-maintained wrapper that gives
us explicit runtime composition, module middleware (sandboxing), TypeScript
declaration generation, and a documented native-module adapter pattern.

### 8.2 Runtime composition API

go-go-goja's modern API is explicit composition (legacy `engine.New()` is
removed):

```go
// pkg/runtime/runtime.go
ctx := context.Background()

factory, err := engine.NewRuntimeFactoryBuilder().
    WithModules(dockermetricsModule{}).      // our native module registrar
    UseModuleMiddleware(engine.MiddlewareOnly("dockermetrics", "fs")).
    WithRuntimeInitializers(preludeInitializer).  // installs prelude.js globals
    Build()
if err != nil {
    return err
}

rt, err := factory.NewRuntime(
    engine.WithStartupContext(ctx),
    engine.WithLifetimeContext(lifetimeCtx),
)
if err != nil {
    return err
}
defer rt.Close(ctx)
```

Key objects:

- `RuntimeFactory` — reusable, immutable description; build once at startup.
- `Runtime` — one goja VM, bundled with `VM`, `Require`, `Loop`, `Owner`.
- `runtimeowner` / `runtimebridge` — the safe way to call into a VM from other
  goroutines (`Call(ctx, op, fn)` runs `fn` on the VM's owner goroutine).

### 8.3 The native module

Our module is `dockermetrics`. It exposes the *leaves* plus a few lifecycle
hooks. Sketch:

```go
// pkg/runtime/module/dockermetrics.go
package dockermetrics

type m struct{}

var _ modules.NativeModule = (*m)(nil)

func (m) Name() string { return "dockermetrics" }
func (m) Doc() string  { return "Docker-backed metric sources for docker-metrics dashboards." }

func (m) Loader(vm *goja.Runtime, moduleObj *goja.Object) {
    exports := moduleObj.Get("exports").(*goja.Object)

    exports.Set("now", func() int64 { return time.Now().Unix() })

    // containers(host) -> [{name,image,labels,host,state,restarts,limit,pidsLimit}]
    exports.Set("containers", func(call goja.FunctionCall) goja.Value {
        return vm.ToValue(registry.listContainers(call.Argument(0).String()))
    })

    // samples(name, host, windowSeconds, n) -> [{t,cpu,mem,rx,tx,ior,iow,pids}]
    exports.Set("samples", func(name, host string, window, n int64) goja.Value {
        return vm.ToValue(registry.samples(name, host, window, n))
    })

    // emit(sink, frame) — hand a frame to the Go sink registry (prom/ws/file)
    exports.Set("emit", func(sink string, frame goja.Value) error {
        return registry.emit(sink, frame.Export())
    })

    // registerRule / unregisterRule, used by the prelude for rule bookkeeping
    exports.Set("registerWatcher", registry.registerWatcher)
    exports.Set("unregisterWatcher", registry.unregisterWatcher)
}

func init() { modules.Register(&m{}) }
```

The module is deliberately **pull-only**: JS asks for containers and samples; it
cannot ask the daemon to execute shell commands, read arbitrary files, or make
network calls. The middleware `MiddlewareOnly("dockermetrics")` enforces this —
even if another module is registered globally, this runtime cannot `require` it.

`platform.DockerModule` needs a dependency injection surface: the collector's
`store.Store` and the sink registry. Because the module is registered via a
package-level `init()`, inject dependencies through a runtime-scoped value:

```go
factory, _ := engine.NewRuntimeFactoryBuilder().
    WithModules(dockermetricsModule{store: st, sinks: sinks}).
    Build()
```

Implement `RuntimeModuleRegistrar` (the interface in
`pkg/engine/runtime_modules.go`) so the module instance carries the store. Do
**not** use a global singleton; two runtimes must be able to see different stores
in tests.

### 8.4 The engine prelude

The prelude is a JS file embedded with `go:embed` and executed once per runtime
during an initializer, before any user code. It is a near-verbatim port of the
prototype's `DM` engine, minus the simulation:

```js
// pkg/runtime/prelude/engine.js  (excerpt)
const core = require("dockermetrics");

class Metric { /* .pipe, .is, pre/reducer/post … */ }
class Pred   { /* .and/.or/.not/.sustained … */ }
class Group  { /* .read/.check/.history/.stream/.watch … */ }
// … ops, selectors, trees, Report, Rule, Watcher, Stream, sinks …

module.exports = { Metric, Pred, Group, rule, cpu, mem, net, io, pids, pct, mb,
                   of, rate, avg, sum, min, max, p50, p95, p99, count,
                   by, last, bucket, gt, gte, lt, lte, eq, between,
                   and, or, not, sustained, add, sub, mul, div,
                   prometheus, statsd, file, tap, sleep, docker, fleet,
                   metric, spark, now: core.now };
```

Then the runtime initializer installs those exports as globals and adds `console`
and `time`:

```js
for (const [k, v] of Object.entries(engineExports)) globalThis[k] = v;
globalThis.time = t => new Date(t * 1000).toTimeString().slice(0, 8);
globalThis.console = core.console || consoleShim;
```

Now `dashboard.js` written against the prototype's globals runs unchanged.

### 8.5 Executing a dashboard

```text
RunDashboard(ctx, dashboardID, source):
    rt := pool.Acquire(dashboardID)        # one runtime per active dashboard
    defer pool.Release(dashboardID)
    vm := rt.VM
    // capture top-level await by wrapping, like the prototype's AsyncFunction:
    wrapped := "(async () => {\n" + source + "\n})()"
    v, err := vm.RunString(wrapped)
    if isPromise(v): await vm.ToValue(v).Export()  # via rt.Loop
    if err: emit run-error frame to the dashboard's channel
```

Long-running dashboards (with `stream(...)`, `watch(...)`, `sleep(...)`) keep the
runtime alive. `runCode`'s "stop previous run" semantics map to
`rt.Owner.Interrupt()` / closing and rebuilding the runtime.

### 8.6 Isolation, safety, resource limits

- **Runtime per dashboard.** One runtime per active dashboard/edit session. A
  dashboard that loops forever only burns its own CPU budget.
- **Interruption.** Use `rt.Owner.Call/Post` with a context; interrupt a running
  script when the user presses *Stop* or on `RunDashboard` for a new revision.
- **No ambient authority.** `MiddlewareOnly("dockermetrics")`. No `os`, `exec`,
  `fs` (unless explicitly requested), no network.
- **Bounded output.** Sinks drop frames when the downstream channel is full
  (backpressure), and the frame rate per stream is capped by `every`.
- **Time budget.** A watchdog interrupts a script that exceeds a configurable
  wall-clock budget per tick (default 2s) to protect the daemon.
- **Determinism for tests.** `core.now()` reads a clock interface; tests inject a
  fake clock. The prototype's `sleep()` becomes a timer driven by that clock.

---

## 9. Backend Layout

Target Go package layout (create these under the normalized module root):

```text
cmd/docker-metrics/main.go        cobra/glazed root + subcommands
pkg/doc.go                        package doc for the root package
pkg/logcopter.go                  generated logging metadata (already present)

pkg/cli/                          command implementations
    root.go                       root command
    serve.go                      `serve` (daemon)
    poll.go                       `poll` (one-shot / stream to stdout)
    ide.go                        `ide` (serve IDE, maybe open browser)
    check.go                      `check` (validate dashboards + config)

pkg/docker/                       Docker Engine API client + host parsing
    host.go                       parseHost(unix://, tcp://, ssh://)
    client.go                     thin client (net/http + ssh) or moby/docker
    stats.go                      raw StatsJSON structs
    normalize.go                  §6 arithmetic → store.Sample
    events.go                     /events streaming
    list.go                       /containers/json

pkg/store/                        sample storage
    sample.go                     Sample struct
    ring.go                       fixed-capacity per-container ring buffer
    memory.go                     Store implementation over rings
    iface.go                      Store interface + Filter

pkg/collector/                    orchestration
    collector.go                  poll loop, concurrency limits, timeouts
    reconcile.go                  list ↔ store reconciliation

pkg/runtime/                      go-go-goja integration
    manager.go                    RuntimeFactory + per-dashboard runtime pool
    module.go                     RuntimeModuleRegistrar wiring the store
    prelude/
        engine.js                 ported DSL (the big one)
        console.js                console shim
    initializer.go                installs prelude globals
    run.go                        run/interrupt a dashboard

pkg/metricsengine/                (optional) Go-side derived metrics if needed
    # Only if we decide some metrics must be computed in Go (e.g. for
    # fan-out performance). Default: keep everything in the prelude.

pkg/hub/                          websocket fan-out
    hub.go                        clients, topics, broadcast, backpressure
    client.go                     read/write pumps, ping/pong
    protocol.go                   frame types (§ reference/01)

pkg/httpapi/                      REST + static serving
    server.go                     mux, middleware, shutdown
    dashboards.go                 CRUD for dashboards/metrics
    containers.go                 container list/read/inspect
    run.go                        POST /api/v1/run (IDE "Run")
    metrics.go                    GET /metrics (Prometheus)
    static.go                     go:embed of the built frontend

pkg/dashstore/                    persistence for definitions
    model.go                      Dashboard, MetricDef, RuleDef structs
    sqlite.go                     modernc.org/sqlite persistence (no cgo)
    files.go                      optional filesystem backend

pkg/config/                       config file + flags
    config.go                     YAML/TOML config, defaults

web/                              the React IDE (Vite + TypeScript)
    package.json  vite.config.ts  index.html
    src/…                         see §13
```

Notes:

- `pkg/` is for reusable packages. Do not put CLI glue in `pkg/`.
- `logcopter_generate.go` already declares the area prefix
  `go-go-golems.docker-metrics`; keep package names consistent when you add
  logging.
- Prefer `net/http`'s `ServeMux` (Go 1.22+ patterns, e.g. `POST /api/v1/run`)
  for the HTTP API, or `go-chi` only if routing grows complex. Avoid heavy
  frameworks.

---

## 10. WebSocket Hub

One endpoint, `/ws`, multiplexes every live dashboard over a single connection.

### 10.1 Design

```text
Browser ──ws connect──▶ Hub ──subscribe(topic)──▶ Streams in runtimes
                          │
                          ├─ broadcast(topic, frame)  → all subscribers
                          └─ per-client outbound buffered channel (drop on full)
```

- Each client subscribes to one or more **topics**: `fleet`, `container:<name>`,
  `dashboard:<id>`, `events`.
- Runtimes write frames to the hub via a sink (`ws("dashboard:1")` or the
  implicit hub sink for the IDE).
- Slow clients are dropped frames, not blocked forever. When the outbound buffer
  is full, close with a `1008`/policy code or drop to a snapshot resend.

### 10.2 Frame shapes (summary; full spec in reference/01)

```json
{ "type": "hello",     "serverTime": 1770000000, "topics": ["fleet"] }
{ "type": "subscribe", "topic": "container:api-1" }
{ "type": "frame",     "topic": "container:api-1",
  "t": 1770000001, "data": { "cpu": 0.42, "mem": 268435456 } }
{ "type": "event",     "kind": "restart", "container": "api-1", "at": 1770000002 }
{ "type": "run",       "dashboard": "d1", "status": "ok", "ms": 12 }
{ "type": "error",     "scope": "dashboard:d1", "message": "bad duration \"2x\"" }
```

### 10.3 Library choice

Use [`coder/websocket`](https://github.com/coder/websocket) (`nhooyr.io/websocket`
successor) for a minimal, idiomatic, context-aware implementation. It supports
`wsjson.Read/Write`, zero-copy reads, and clean `ctx`-driven shutdown. Gorilla
works too but is less context-friendly. Whatever you pick, implement the standard
hub pattern: one reader goroutine and one writer goroutine per client, with a
buffered send channel and ping/pong keepalive (default 30s).

---

## 11. HTTP API

REST surface (versioned under `/api/v1`), plus Prometheus and the SPA. Full
spec in `reference/01`.

| Method + Path | Purpose |
| --- | --- |
| `GET /healthz` | Liveness. |
| `GET /api/v1/hosts` | Docker hosts and their status. |
| `GET /api/v1/containers` | List with metadata + last sample. |
| `GET /api/v1/containers/{name}` | Inspect one (labels, image, restarts, state). |
| `GET /api/v1/containers/{name}/samples?window=5m` | Raw samples for charts. |
| `GET /api/v1/dashboards` | List saved dashboards. |
| `POST /api/v1/dashboards` | Create (name, source, metadata). |
| `GET/PUT/DELETE /api/v1/dashboards/{id}` | Read/update/delete. |
| `POST /api/v1/run` | **IDE Run**: compile+run `{source}` in a runtime, stream output on `/ws`. |
| `POST /api/v1/run/{id}/stop` | Interrupt a running dashboard. |
| `GET /api/v1/events` | Recent events (JSON) for the Events tab. |
| `GET /metrics` | Prometheus exposition. |
| `GET /` | Live dashboard SPA (embedded). |
| `GET /ide` | IDE mode SPA (embedded, same bundle, different route). |

The `Run` endpoint is the heart of IDE mode: it accepts raw JS, runs it in a
go-go-goja runtime, and returns frames over WebSocket topic
`dashboard:<runID>`.

---

## 12. Prometheus Exposition

The `prometheus(prefix, port)` sink in the DSL registers into
`prometheus/client_golang`. In daemon mode we do not open a second port; the
existing `/metrics` handler renders a `prometheus.Registry` that the sinks
populate.

Design:

- One `prometheus.Registry` per daemon.
- For each frame, flatten `data` into samples exactly like the prototype's
  `flatten()`: numbers become gauges; objects recurse; the special keys
  `rx,tx,r,w,current,limit` become suffixes; container/group names become labels.
- Use `prometheus.NewGaugeVec` keyed by the discovered label set, or
  `MustNewConstMetric` with a `Desc` you build per series. The prototype emits
  `# TYPE … gauge` text; mirror that in the exposition.
- Metric names: `docker_<metric>_<suffix>{container="web-1",host="local"}`.
  Sanitize names to `[a-zA-Z_:][a-zA-Z0-9_:]*`.

```text
# Example exposition produced by a stream of {cpu: <avg>, mem: <mb>}
# HELP docker_cpu CPU usage (fraction of one core)
# TYPE docker_cpu gauge
docker_cpu{container="api-1",host="local"} 0.3521
docker_mem{container="api-1",host="local"} 268435456
```

Also expose collector-internal metrics (`docker_metrics_scrape_duration_seconds`,
`docker_metrics_containers_total`) so operators can alarm on the collector
itself.

---

## 13. React IDE Mode

The React app is a port of the prototype's UI, rebuilt as a proper Vite +
TypeScript project and wired to the real backend.

### 13.1 Tooling

- **Vite + React + TypeScript.** `web/package.json`, `web/vite.config.ts`.
- **No CDN.** Everything is bundled; `index.html` has no external scripts.
- **Embedding.** `web/dist/` is copied to `pkg/httpapi/static/` (or embedded via
  a `//go:generate` that runs `pnpm build` then copies) and served with
  `http.ServeMux` + `go:embed`, per the repo's standard single-binary pattern.
- **Serving routes.** `/` serves the live dashboard; `/ide` serves the IDE. Same
  bundle, route-driven.

### 13.2 Components (port targets from the prototype)

| Prototype component | Real role |
| --- | --- |
| `Editor` | Code editor with syntax highlighting + `Ctrl/Cmd+Enter`. Keep, but consider CodeMirror 6 for real editing. |
| `Console` | Renders `console.log/table/warn/error`. Data now arrives over the WS/`run` channel. |
| `Fleet` | Reads `GET /api/v1/containers` + WS frames; buttons POST actions. |
| `Charts` | Reads `/samples` history; live append from WS. |
| `Events` | Reads `/api/v1/events` + WS event frames. |
| `Sinks` | Shows `prometheus()` text output fetched from `/metrics`, plus statsd/file summaries. |
| `PRESETS` drawer | Presets live in the frontend; `pick()` POSTs the source to `/api/v1/run`. |
| `App` shell | Tabs, panes, sim speed control → becomes a *live* clock + pause/resume of live updates. |

### 13.3 Key changes from the prototype

- **No simulation clock.** `SPEEDS` and `playing` disappear. The clock displays
  real time. Live updates are throttled to the render cadence.
- **`runCode` becomes a network call.** `run(source)` opens a WS subscription
  and POSTs `/api/v1/run`; the console/fleet/charts render frames.
- **State.** Keep the prototype's simple `useState`/`useRef` approach initially.
  If state grows, introduce Redux Toolkit or Zustand, but do not start there.
- **Persistence.** The IDE loads/saves dashboards through `/api/v1/dashboards`.
- **Charts.** Keep the hand-rolled SVG chart from the prototype (it is small and
  dependency-free); revisit only if features demand a library.

### 13.4 Frontend file layout

```text
web/src/
    main.tsx            entry; picks Dashboard or IDE by route
    api/client.ts       typed fetch wrappers
    ws/connection.ts    reconnecting WebSocket client + topic subscriptions
    components/
        Editor.tsx  Console.tsx  Fleet.tsx  Charts.tsx  Events.tsx  Sinks.tsx
        PresetDrawer.tsx  TopBar.tsx
    presets/index.ts    the 21 presets, ported verbatim
    theme/              CSS variables from the prototype
    types/dsl.d.ts      generated/hand-written DSL types (see §8.7)
```

### 13.5 TypeScript declarations for the module

go-go-goja supports `modules.TypeScriptDeclarer` and `gen-dts`. Declare the
`dockermetrics` module so the IDE gets autocomplete for `core.*`; keep the
prelude's engine types hand-written in `web/src/types/dsl.d.ts`.

---

## 14. Implementation Plan

Build in the order below. Each phase is shippable and testable on its own.
Track these as tasks in `tasks.md` (see the checklist at the end).

### Phase 0 — Bootstrap (done)

- Repo created from `go-go-golems/go-template`, module normalized to
  `github.com/go-go-golems/docker-metrics`, docmgr initialized, ticket created,
  prototype imported. *(This document.)*

### Phase 1 — Docker client and collector (no JS yet)

Deliverable: `docker-metrics poll --host unix:///var/run/docker.sock` prints a
table of live samples.

1. `pkg/docker/host.go`: parse `unix://`, `tcp://`, `ssh://`, default to
   `/var/run/docker.sock`.
2. `pkg/docker/client.go`: choose `moby/moby/client` (`client.FromEnv`,
   `client.WithHost`) or a hand-rolled `net/http` client for unix/tcp + `ssh`
   via `golang.org/x/crypto/ssh`. Prefer the moby client for `/stats`
   correctness; wrap it so we can fake it in tests.
3. `pkg/docker/normalize.go`: implement §6.2–6.5 exactly. Unit-test against
   captured JSON fixtures for cgroup v1 and v2.
4. `pkg/store/`: ring buffer (default capacity = 1h at 1s = 3600 samples per
   container) + interface.
5. `pkg/collector/`: poll list + stats + events; concurrency semaphore; timeouts.
6. `pkg/cli/poll.go`: one-shot and streaming table output (glazed for JSON/table).

**Exit test:** run against a real local Docker daemon; compare CPU% and memory
against `docker stats` within a small tolerance (ignoring the cache-under-report
difference, which we intentionally subtract).

### Phase 2 — Metric DSL prelude on the backend

Deliverable: a `docker-metrics check` / `run` command evaluates a dashboard JS
file and prints `console.log` output.

1. Port the prototype's `DM` engine into `pkg/runtime/prelude/engine.js`,
   replacing `world.sims` access with `require("dockermetrics")` calls.
2. `pkg/runtime/module/`: native module exposing `containers`, `samples`,
   `now`, `limit`, `emit`, `console`.
3. `pkg/runtime/manager.go`: build the factory, create a runtime, install the
   prelude globals, run user code.
4. Port the 21 presets as integration-test fixtures; run each and assert no
   error and expected output shape.

**Exit test:** the "one-metric", "units", "aggregation" and "grouping" presets
produce correct numbers against a fake store; all presets execute without error
against a live store.

### Phase 3 — WebSocket hub + live dashboard

Deliverable: browser shows live container cards updating over `/ws`.

1. `pkg/hub/`: hub, client pumps, protocol frames.
2. Implicit hub sink: `stream(...)` frames are published to the WS topics.
3. Minimal frontend: Fleet + Charts wired to `/ws` and `/api/v1/containers`.
4. `pkg/cli/serve.go` and `pkg/httpapi/server.go`.

**Exit test:** open two browsers; start a stream; both update; killing one does
not stall the other.

### Phase 4 — IDE mode

Deliverable: edit JS, press Run, see console/fleet/charts update; save dashboards.

1. `POST /api/v1/run` + `POST /api/v1/run/{id}/stop`.
2. Runtime pool keyed by run ID; interruption on stop/re-run.
3. Editor + Console + Preset drawer in the frontend.
4. `pkg/dashstore/`: SQLite (modernc, no cgo) persistence for dashboards.

**Exit test:** run the "incident drill" preset and watch the Fleet, Charts and
Events tabs react.

### Phase 5 — Prometheus + hardening

Deliverable: `/metrics` scrapes cleanly; alerts via rules; graceful shutdown.

1. `prometheus()` sink into `client_golang`.
2. Rule/watcher actions wired to real container `restart`/`stop`/`start` via the
   Docker client.
3. Resource limits, backpressure, logcopter logging, `/healthz`.
4. Packaging: `make build-bin`, GoReleaser snapshot, embed verification.

**Exit test:** `curl localhost:8080/metrics` shows the streamed series; a rule
restarts a deliberately poisoned container; `SIGTERM` drains connections.

---

## 15. Testing Strategy

- **Unit (Go):** `normalize.go` against captured Docker JSON for cgroup v1/v2;
  `store` ring semantics; `host` parsing; hub backpressure.
- **Integration (Go, fake Docker):** an `httptest.Server` that serves canned
  `/containers/json`, `/stats` and `/events`. Assert the collector produces the
  expected samples and the store bounds memory.
- **Runtime integration (Go + goja):** build a real `engine.Runtime` with the
  prelude and a fake store; run each preset; assert outputs. This is the highest
  value test set — it protects the DSL contract.
- **Golden tests:** `docker-metrics check` over `testdata/dashboards/*.js`
  produces stable stdout.
- **Frontend:** Vitest component tests for Console/Charts; a Playwright smoke
  test that loads `/ide`, runs a preset against a fake API, and asserts the
  console shows a number.
- **End-to-end:** `docker compose` bringing up a couple of containers plus the
  daemon; assert `/metrics` and a WS frame.

Use `GOWORK=off go test ./... -count=1` inside the repo (see the playbook).

---

## 16. Performance and Resource Notes

- **Sampling cost.** Each container is one HTTP round trip per interval. 100
  containers at 2s = 50 req/s. Cache the Docker client, reuse HTTP connections,
  and cap concurrency.
- **Store memory.** 3600 samples × ~72 bytes × containers. 200 containers ≈
  52 MB. Make capacity configurable and consider columnar storage later.
- **JS cost.** A runtime per active dashboard; prelude evaluation is cheap
  (once). Per-tick evaluation is `O(containers × ops)`; keep the prelude's
  series slicing O(n) and avoid re-allocating in hot paths.
- **WS fan-out.** One frame per topic per tick, broadcast to N subscribers.
  Drop to slow clients; do not let one slow browser slow the collector.
- **Prometheus cardinality.** Label sets come from container names and group
  keys; cap the number of series and expose a dropped-series counter.

---

## 17. Security

- **Trust boundary.** IDE mode is trusted-operator only. Bind to `127.0.0.1` by
  default; require an explicit flag to bind a public interface, and then require
  a bearer token or an SSH tunnel.
- **JS sandbox.** `MiddlewareOnly("dockermetrics")`; no `os`, `exec`, `fs`,
  `fetch`. Interrupt long-running scripts. The sandbox is defense-in-depth
  behind the trusted-operator boundary, not a public compute service.
- **Docker access.** The daemon has whatever Docker rights the process has. Do
  not run the daemon as root by default; document the docker group requirement
  or socket-proxy pattern.
- **SSH hosts.** Support key-based auth only; never log credentials; validate
  the host key against `known_hosts`.
- **Input validation.** Durations, selectors, and `by()` keys are validated in
  the prelude; the backend validates dashboard payload size and rejects
  pathological sources (e.g. > 256 KB).

---

## 18. Alternatives Considered

| Option | Why rejected |
| --- | --- |
| Reimplement the DSL in Go | Two implementations diverge; loses the prototype's exact semantics; no user-authoring without recompile. |
| CEL / Starlark expression language | No async streams or imperative rule actions; the prototype is JS. |
| Lua | Fine engine, but rewriting the DSL and UI presets loses the "prototype is the spec" advantage. |
| Node.js sidecar for JS | Violates "one binary"; adds a runtime dependency; harder deployment. |
| Prometheus + cAdvisor + Grafana | Heavier stack; poor ad-hoc authoring; not self-contained. |
| `?stream=1` per container | One connection per container; does not scale past small fleets. |
| SQLite/TSDB for long-term samples | Out of scope; Prometheus owns long-term. Definitions only are persisted. |

---

## 19. Open Questions

1. **CPU unit.** We chose fraction-of-one-core to match the prototype. Confirm
   this is what operators expect when they see `100%`.
2. **History retention.** 1 hour in memory by default; is per-host config
   needed? Downsample older samples to extend cheaply?
3. **Runtime pooling.** One runtime per dashboard vs. one shared "fleet" runtime
   plus per-dashboard runtimes. Start with per-dashboard; measure.
4. **Frontend editor.** Keep the prototype's textarea-mirror editor or adopt
   CodeMirror 6? Adopt CodeMirror if autocomplete/diagnostics are wanted.
5. **`statsd()` sink.** Still useful, or drop in favor of Prometheus? Keep as an
   optional sink.
6. **Rule actions.** Should `restart()` be allowed by default, or gated behind a
   `--allow-mutations` flag? Recommend gating it.
7. **Go module hosting.** The Go module path assumes org `go-go-golems`; confirm
   owner and repo name before the first push (see the blocker in the diary).

---

## 20. References

### 20.1 External APIs and libraries

- Docker Engine API reference: <https://docs.docker.com/reference/api/engine/>
  — container stats endpoint, cgroup compatibility notes.
- `moby/moby/client` (Go): <https://pkg.go.dev/github.com/moby/moby/client>
- `docker/go-sdk` (higher-level Go client): <https://github.com/docker/go-sdk>
- `coder/websocket` (Go WS): <https://github.com/coder/websocket>
- `prometheus/client_golang`: <https://pkg.go.dev/github.com/prometheus/client_golang>
- `go-go-golems/go-go-goja`: <https://github.com/go-go-golems/go-go-goja>
  — local checkout at `~/code/go-go-golems/go-go-goja`.
- `dop251/goja`: <https://github.com/dop251/goja>
- `modernc.org/sqlite` (cgo-free SQLite): <https://pkg.go.dev/modernc.org/sqlite>

### 20.2 Repository files

- `go.mod` — module `github.com/go-go-golems/docker-metrics`, Go 1.26.6.
- `cmd/docker-metrics/main.go` — binary entry point.
- `pkg/doc.go`, `pkg/logcopter.go` — root package + generated logging metadata.
- `logcopter_generate.go` — area prefix `go-go-golems.docker-metrics`.
- `Makefile` — `build`, `test`, `lint`, `logcopter-check`, `goreleaser`.
- `AGENT.md` — build commands and project structure conventions.
- `ttmp/` — this ticket.

### 20.3 Ticket files

- `design-doc/01-analysis-design-and-implementation-guide-for-interns.md` —
  this document.
- `reference/01-system-reference-http-websocket-prometheus-and-dashboard-dsl.md`
- `reference/02-docker-engine-api-and-metrics-collection-notes.md`
- `playbook/01-build-run-and-test-playbook.md`
- `sources/local/dockermetrics-ide-prototype.html`
- `various/01-diary.md`

### 20.4 go-go-goja symbols to read

- `pkg/engine/factory.go` — `NewRuntimeFactoryBuilder`, `Build`, `NewRuntime`.
- `pkg/engine/options.go` — `WithStartupContext`, `WithLifetimeContext`.
- `pkg/engine/runtime_modules.go` — `RuntimeModuleRegistrar`.
- `modules/common.go` — `NativeModule`, `Register`, `DefaultRegistry`.
- `pkg/runtimebridge` — safe calls into the VM from other goroutines.
- `pkg/tsgen/spec` — TypeScript declarations for modules.

---

## 21. Task Checklist (for `tasks.md`)

- [ ] Phase 1: Docker host parsing + client + normalization + store + collector.
- [ ] Phase 1: capture cgroup v1/v2 fixtures and unit-test the formulas.
- [ ] Phase 2: native `dockermetrics` module (`containers`, `samples`, `now`, `emit`).
- [ ] Phase 2: port the prelude engine from the prototype; install globals.
- [ ] Phase 2: run all 21 presets as runtime integration tests.
- [ ] Phase 3: WebSocket hub + protocol frames + implicit hub sink.
- [ ] Phase 3: `serve` command, `/healthz`, static embed.
- [ ] Phase 4: `/api/v1/run` + runtime pool + interruption.
- [ ] Phase 4: React IDE (editor, console, fleet, charts, events, sinks).
- [ ] Phase 4: dashboard persistence (SQLite).
- [ ] Phase 5: Prometheus sink + collector self-metrics.
- [ ] Phase 5: rule actions gated behind `--allow-mutations`.
- [ ] Phase 5: packaging, GoReleaser snapshot, embed verification.

---

## Appendix A — Worked example traced end to end

User code (modified "aggregate" preset):

```js
const d = docker();
console.log("api avg cpu", await d.containers({ label: "app=api" }).read(cpu.pipe(avg)));
console.log("worker mem MB", await d.containers("worker-*").read(mem.pipe(sum, mb)));
```

Trace:

1. `docker()` → `new Docker({host:"local"})` in the prelude (no Go call yet).
2. `.containers({label:"app=api"})` → `new Group([d], sel)`; `matcher(sel)` builds a
   predicate over `labels.app === "api"`.
3. `.read(cpu.pipe(avg))`:
   - `cpu.pipe(avg)` → `Metric{src:"cpu", ops:[reduce(avg)]}`.
   - `Group.read` → `sims()` calls `core.containers("local")`, which the native
     module answers from the store's live container registry.
   - for each sim, `valueOf(metric, ctx)` → `core.samples(name,host,2,2)` → CPU
     fractions; `avg` reduces the group's values to one number.
   - returns a scalar (`avg` reducer + scalar source ⇒ scalar).
4. `console.log` → the module's `console` shim queues a `{level:"log",text}` entry
   which the run channel forwards to the browser Console tab.

## Appendix B — Preset coverage matrix

| Preset group | Presets | Backend features exercised |
| --- | --- | --- |
| Basics | one-metric, multi-metric, selectors, units | store reads, selectors, maps |
| Streaming | stream-iter, stream-multi, sinks | scheduler, iterator, sinks |
| Aggregation | aggregate, grouping, history | reducers, by(), last/bucket |
| Alerts | predicates, rules, events, leak-heal | Pred, Watch, events bus |
| Advanced | custom, compose, pipeline, fleet | custom metrics, combine, multi-host |
| Scenarios | noisy, capacity, incident | everything at once |
| Sandbox | scratch | none (cheat sheet) |
