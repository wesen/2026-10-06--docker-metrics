---
Title: 'System Reference: HTTP, WebSocket, Prometheus and Dashboard DSL'
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
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Frozen wire contracts for docker-metrics: HTTP API, WebSocket frame shapes, Prometheus exposition rules, and the exact JavaScript DSL grammar and semantics."
WhatFor: "Use as the authoritative interface contract when implementing the daemon, the IDE, or a client."
WhenToUse: "Before changing any endpoint, frame, metric name, or DSL function."
LastUpdated: 2026-10-06T14:53:30.553744-04:00
---

# System Reference: HTTP, WebSocket, Prometheus and Dashboard DSL

This document freezes the contracts. If you change anything here, change it here
first, then update the code and the main design doc. The DSL section is a direct
extract of the semantics implemented by
`sources/local/dockermetrics-ide-prototype.html`.

---

## 1. HTTP API

Base path `/api/v1`. All bodies are JSON (`application/json`). Errors use a
single shape:

```json
{ "error": { "code": "bad_request", "message": "unknown by() key \"foo\"" } }
```

### 1.1 Health

| Method | Path | Response |
| --- | --- | --- |
| GET | `/healthz` | `200 {"status":"ok","uptimeSeconds":123}` |
| GET | `/readyz` | `200` when at least one Docker host is connected, else `503`. |

### 1.2 Hosts and containers

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/hosts` | `[{name, uri, connected, dockerVersion, cpus, memTotal, cgroupVersion, lastError}]` |
| GET | `/api/v1/containers` | `[{name, id, image, labels, host, state, restarts, lastSample}]` |
| GET | `/api/v1/containers/{name}` | One container's metadata; `404` if unknown. |
| GET | `/api/v1/containers/{name}/samples?window=5m&metric=cpu` | Raw or pre-aggregated samples for charts. |

`/containers/{name}/samples` query parameters:

- `window` — duration string (`30s`, `5m`, `1h`). Default `5m`.
- `metric` — `cpu`, `mem`, `rx`, `tx`, `ior`, `iow`, `pids`. Default all.
- `bucket` — optional duration; reduces to buckets using `avg`.
- `host` — restrict to one host when the container name is ambiguous.

Response:

```json
{
  "name": "api-1",
  "host": "local",
  "points": [
    { "t": 1770000000, "cpu": 0.35, "mem": 268435456, "rx": 8.9e7, "tx": 1.2e8 }
  ]
}
```

### 1.3 Dashboards (persistence)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/dashboards` | List `[{id,name,updatedAt,description}]`. |
| POST | `/api/v1/dashboards` | Create `{name,source,meta}`; returns `{id}`. |
| GET | `/api/v1/dashboards/{id}` | `{id,name,source,meta,updatedAt}`. |
| PUT | `/api/v1/dashboards/{id}` | Replace `{name,source,meta}`. |
| DELETE | `/api/v1/dashboards/{id}` | Delete. |

`meta` is free-form presentation metadata (e.g. `{"tabs":["fleet","charts"]}`).

### 1.4 Run (IDE)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/v1/run` | Body `{source, runId?}`. Compiles and runs in a fresh runtime. Returns `{runId, accepted:true}`. |
| POST | `/api/v1/run/{runId}/stop` | Interrupt and release the runtime. Returns `{stopped:true}`. |

Frame output for a run is delivered over WebSocket topic `run:<runId>`. If
`runId` is omitted the server generates one and returns it.

### 1.5 Events

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/events?limit=200` | Recent events: `[{t,type,msg,container?,rule?}]`. |

### 1.6 Prometheus and SPA

| Method | Path | Description |
| --- | --- | --- |
| GET | `/metrics` | Prometheus text exposition (`text/plain; version=0.0.4`). |
| GET | `/` | Live dashboard SPA. |
| GET | `/ide` | IDE SPA (same bundle, IDE route). |
| GET | `/assets/*` | Embedded static assets (hashed filenames). |

---

## 2. WebSocket Protocol

Endpoint: `GET /ws` (upgrade). All messages are JSON text frames.

### 2.1 Client → server

```json
{ "type": "subscribe",   "topic": "fleet" }
{ "type": "unsubscribe", "topic": "fleet" }
{ "type": "subscribe",   "topic": "container:api-1" }
{ "type": "subscribe",   "topic": "run:abc123" }
{ "type": "subscribe",   "topic": "events" }
{ "type": "ping" }
```

### 2.2 Server → client

```json
{ "type": "hello", "serverTime": 1770000000, "topics": ["fleet","events"] }
{ "type": "subscribed", "topic": "fleet" }
{ "type": "frame", "topic": "fleet", "t": 1770000001,
  "data": { "api-1": { "cpu": 0.35, "mem": 268435456 } } }
{ "type": "event", "kind": "restart", "container": "api-1", "at": 1770000002, "rule": null }
{ "type": "log", "run": "abc123", "level": "log", "text": "api avg cpu 0.2298" }
{ "type": "log", "run": "abc123", "level": "table", "cols": ["time","cpu"], "rows": [{"time":"12:00:01","cpu":0.35}] }
{ "type": "run", "run": "abc123", "status": "ok", "ms": 12 }
{ "type": "run", "run": "abc123", "status": "error", "message": "bad duration \"2x\"" }
{ "type": "pong" }
```

### 2.3 Frame semantics

- `frame.data` is exactly what the prelude's `Stream` produced: either a scalar
  per container (`{name: value}`), a nested tree (when `by()` was used), or an
  object of named metrics.
- `t` is unix seconds on the server clock.
- Topics are stable strings. A client that subscribes twice to a topic gets one
  stream.
- **Backpressure:** if a client's outbound queue exceeds its limit (default 256
  frames), the server drops the oldest frames and sets an `overflow: true`
  marker on the next frame. It never blocks the producer.

### 2.4 Keepalive

- Server sends WebSocket ping every 30s; expects pong within 10s.
- Client may send `{"type":"ping"}`; server replies `{"type":"pong"}`.

### 2.5 Close codes

| Code | Meaning |
| --- | --- |
| 1000 | Normal closure. |
| 1008 | Policy violation (unauthorized, too many subscriptions). |
| 1011 | Server error. |
| 1013 | Try again later (server draining). |

---

## 3. Prometheus Exposition

### 3.1 Naming

- Series base name: `docker_<metric>_<suffix>` where `<metric>` is the DSL
  metric name with non-word characters replaced by `_`, and `<suffix>` is one of
  the structured keys (`rx`, `tx`, `r`, `w`, `current`, `limit`) when present.
- Labels: `container`, `host`, and any `by()` group keys (`service`, `tier`,
  `image`, `group`, `group1`, …).
- All series are gauges in v1.

### 3.2 Flatten rules (mirrors the prototype's `flatten()`)

```text
flatten(data, labels={}):
    out = []
    for (k, v) in data:
        if v is number:          out.push({name: sanitize(k), labels, v})
        if v is boolean:         out.push({name: sanitize(k), labels, v: v?1:0})
        if v is object:
            for (k2, v2) in v:
                if k2 in {rx,tx,r,w,current,limit}:
                    flatten({k + "_" + k2: v2}, labels)
                else:
                    depth = labels.count("group*")
                    flatten(v2, labels + {container-or-group(depth): k2})
```

### 3.3 Collector self-metrics

| Metric | Type | Meaning |
| --- | --- | --- |
| `docker_metrics_scrape_duration_seconds` | histogram | Per-host `/stats` round-trip time. |
| `docker_metrics_scrape_errors_total{host,reason}` | counter | Failed polls. |
| `docker_metrics_containers_total{host,state}` | gauge | Container counts. |
| `docker_metrics_series_dropped_total` | counter | Series dropped due to cardinality limits. |

### 3.4 Example

```text
# HELP docker_cpu CPU usage as a fraction of one core
# TYPE docker_cpu gauge
docker_cpu{container="api-1",host="local"} 0.3521
docker_cpu{container="api-2",host="local"} 0.3014
# HELP docker_mem Memory working set in bytes
# TYPE docker_mem gauge
docker_mem{container="api-1",host="local"} 268435456
```

---

## 4. Dashboard DSL

This is the authoritative grammar and semantics. It is a direct specification of
the prelude ported from the prototype. User code is evaluated with all of these
names already in scope.

### 4.1 Entry points

```js
docker({ host })            // a Docker handle; host may be "" (local)
fleet([docker(...), ...])   // a multi-host handle
metric(name, async fn)      // custom metric; fn(container) -> number
```

### 4.2 Selectors

```js
d.container(name)                    // Container (single)
d.containers()                       // Group: all running
d.containers("web-*")                // Group: name glob
d.containers(/^postgres/)            // Group: name regex
d.containers(sim => sim.labels.tier === "backend")  // Group: predicate
d.containers({ label: "tier=backend" })             // Group: label
d.containers({ label: ["app=api","env=dev"] })      // Group: multiple labels
d.containers({ image: "node:20" })                  // Group: image prefix
d.containers({ image: /^node/ })                    // Group: image regex
d.containers({ host: "prod-1" })                    // Group: host
d.containers({ state: "restarting" })               // Group: exact state
```

Objects combine with AND. `state` defaults to "not stopped".

### 4.3 Base metrics

```js
cpu            // fraction of one core
mem            // working-set bytes
mem.limit      // memory limit bytes
net            // { rx, tx } cumulative bytes
net.rx  net.tx
io             // { r, w } cumulative bytes
io.r    io.w
pids           // { current, limit }
pids.current
```

### 4.4 Ops (pipe steps)

```js
// maps
pct            v => v * 100
kb             v => v / 1e3
mb             v => v / 1e6
gb             v => v / 1e9
round(n=0)     v => +v.toFixed(n)
of("limit")    v => v / limit
of(x)          v => v / x
// rate
rate("1s")     (v2-v1)/(t2-t1) * per
// reducers (at most one per metric)
avg sum min max p50 p95 p99 count
// window modifier (must follow a reducer)
{ window: "5m" }
```

`metric.pipe(...)` accepts ops and at most one `{ window }`. A second reducer
throws `pipe(): only one reducer (avg, sum, max, …) per metric`.

### 4.5 Reads

```js
await d.container("api-1").read(cpu)                       // scalar
await d.container("api-1").read({ cpu, mem, net })         // object
await d.containers("web-*").read(cpu)                      // {name: value}
await d.containers("web-*").read(cpu.pipe(avg))            // scalar
await d.containers().read(cpu.pipe(avg), by("label:service"))  // tree
await d.container("api-1").check(cpu.is(gt(0.9)))          // bool
```

`by()` keys: `name`, `image`, `host`, `state`, `label:<key>`. Multiple `by()`
calls nest. Unknown key throws.

`history(spec, ...mods)` returns a `Report` (or `{name: Report-ish}`), with
`.flatten()` for rows. Modifiers:

```js
last("15m")            // window
since("2026-10-06T12:00:00Z")
bucket("1m", avg)      // bucketize; default reducer avg
by("host")
```

### 4.6 Predicates

```js
cpu.is(gt(0.9))                     // Pred
mem.pipe(of("limit")).is(gt(0.85))
or(hot, bloat)  and(a, b)  not(p)
sustained(p, "2m")
```

Comparators: `gt gte lt lte eq between(a,b)`. `is()` on a reduced metric is
evaluated as a scalar; otherwise as a series.

### 4.7 Rules and watchers

```js
rule("cpu-saturation")
  .when(sustained(cpu.is(gt(0.9)), "2m"))
  .then(emit("alert"), c => c.restart({ grace: "5s" }))
  .cooldown("10m");

group.watch(rule1, rule2);
```

Actions: `emit(name)` (broadcasts an event) or a function
`(container, event, docker) => …`. Danger mutations (`restart`, `stop`, `start`)
are gated behind the daemon's `--allow-mutations` flag.

### 4.8 Streams and sinks

```js
const frames = d.containers("web-*").stream(cpu, { every: "2s" }).take(4);
for await (const s of frames) console.log(time(s.t), s.container, s.value);

d.containers().stream(
    { cpu: cpu.pipe(avg), mem: mem.pipe(of("limit"), pct, avg) },
    { every: "5s" },
    by("label:service")
  )
  .to(prometheus({ port: 9100, prefix: "dock_" }))
  .to(statsd("udp://localhost:8125", { prefix: "dock." }))
  .to(file("./metrics.ndjson", json))
  .to(tap(f => console.log(time(f.t), f.data)))
  .watch(rule("leak").when(sustained(memPct.is(gt(85)), "3m")).then(emit("page")))
  .start();
```

`Stream` methods: `.to(sink)`, `.take(n)`, `.watch(...rules)`, `.on(event, fn)`,
`.start()`, `.stop()`, and `[Symbol.asyncIterator]`. A `.to()` sink receives
`(frame, stream)`. `frame = { t, data, value, container? }`.

`flat` streams (a single non-reduced metric over a multi-container group)
iterate one `{t, container, value}` per container per tick.

### 4.9 Sinks

```js
prometheus({ port = 9100, prefix = "" })
statsd(url, { prefix = "" })
file(path, fmt = json)
json.fmt(frame)   // => JSON string
tap(fn)           // fn(frame)
```

### 4.10 Helpers

```js
time(t)        // unix seconds -> "HH:MM:SS"
now()          // server unix seconds
spark(numbers) // "▁▂▃▅▆▇█" string
sleep("5m")    // yields the runtime (test/chaos helper; gated off in prod)
```

`chaos.*` exists only in the prototype's simulation and is **not** part of the
production DSL. Keep it in a test-only prelude for fixture tests.

### 4.11 Console

```js
console.log(...)   console.info(...)   console.warn(...)   console.error(...)
console.table(rows)
console.clear()
```

Output is forwarded over `run:<runId>` as `log` frames.

---

## 5. Error taxonomy

| Where | Error | Message example |
| --- | --- | --- |
| DSL parse | bad duration | `bad duration "2x" — use e.g. "30s", "5m", "1h"` |
| DSL pipe | two reducers | `pipe(): only one reducer (avg, sum, max, …) per metric` |
| DSL pipe | bad op | `pipe(): expected an op like mb, pct, of(...), rate(...), avg, p95 or { window }` |
| DSL by | unknown key | `by(): unknown key "foo" — use name, image, host, state or label:<key>` |
| DSL rule | missing when | `rule "x" has no .when(...)` |
| Runtime | timeout | `script exceeded the 2s tick budget` |
| Runtime | unknown container | `No such container: api-9` |
| API | validation | `unknown by() key "foo"` (code `bad_request`) |
