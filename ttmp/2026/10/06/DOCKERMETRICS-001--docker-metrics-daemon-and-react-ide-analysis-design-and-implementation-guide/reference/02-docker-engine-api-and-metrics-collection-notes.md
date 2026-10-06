---
Title: Docker Engine API and Metrics Collection Notes
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
Summary: "Deep notes on the Docker Engine API endpoints used by the collector, the exact normalization arithmetic for CPU/memory/network/block I/O, and cgroup v1/v2 compatibility."
WhatFor: "Reference when implementing or debugging pkg/docker and pkg/collector."
WhenToUse: "Before changing any metric normalization or adding a new Docker field."
LastUpdated: 2026-10-06T14:53:30.632719-04:00
---

# Docker Engine API and Metrics Collection Notes

Audience: whoever implements `pkg/docker` and `pkg/collector`. Read this with
the official reference open: <https://docs.docker.com/reference/api/engine/>.

---

## 1. Endpoints

The Docker daemon exposes a versioned REST API. Both the unix socket and
`tcp://host:2375` speak the same routes; `ssh://` is the same HTTP API tunneled
over SSH (the Docker CLI does this by running `docker system dial-stdio` over the
SSH connection).

| Route | Purpose |
| --- | --- |
| `GET /_ping` | `200 OK` if the daemon is up; cheap health check. |
| `GET /version` | API version negotiation; read `ApiVersion` first. |
| `GET /info` | `NCPU`, `MemTotal`, `KernelVersion`, `CgroupVersion` (via driver). |
| `GET /containers/json?all=1` | Container list with names, image, labels, state, `RestartCount`. |
| `GET /containers/{id}/json` | Full inspect (mounts, env, resources). |
| `GET /containers/{id}/stats?stream=0` | A single stats snapshot. |
| `GET /containers/{id}/stats?stream=1` | Continuous stats stream (one connection per container). |
| `GET /events` | Stream of daemon and container events. |
| `GET /containers/{id}/top` | Process list (optional; useful for a "procs" detail view). |

### 1.1 Version negotiation

Always read `/version` once at startup and send that version in the path, e.g.
`/v1.47/containers/json`. `moby/moby/client` does this automatically when using
`client.WithAPIVersionNegotiation()`.

### 1.2 Host URI parsing

`DOCKER_HOST`-style strings:

```text
unix:///var/run/docker.sock          -> local unix socket
tcp://prod-3:2375                    -> plain TCP
tcp://prod-3:2376                    -> TLS TCP (certs required)
ssh://ops@prod-1                     -> SSH tunnel to /var/run/docker.sock
npipe:////./pipe/docker_engine       -> Windows named pipe
```

The prototype's `parseHost()` reduces these to a short host label:

```text
parseHost(h):
    if h empty: return "local"
    s = strip scheme, strip user@, strip :port and /path
    return "local" if s in {"", "localhost", "127.0.0.1"} else s
```

`local` is special: it is the only host allowed to use the default local socket.

---

## 2. Container list

`GET /containers/json?all=1` returns an array. Fields we use:

| Field | Use |
| --- | --- |
| `Id` | Full container id; poll stats with this. |
| `Names` | `["/web-1"]`; strip the leading `/`. |
| `Image` | `node:20`. |
| `ImageID` | Digest; not used in v1. |
| `State` | `running`, `exited`, `restarting`, `created`, `paused`, `dead`. |
| `Status` | Human string (`Up 3 hours (healthy)`); not parsed. |
| `Labels` | Map; drives selectors (`tier`, `app`, `service`, `env`). |
| `RestartCount` | Integer; the authoritative restart count between events. |

Reconcile on every refresh: containers that disappear from the list (destroyed)
are removed from the store; new ones are added; changed `State`/`RestartCount`
are updated.

---

## 3. Stats payload

`GET /containers/{id}/stats?stream=0` returns one JSON object. Relevant fields:

```text
{
  "read":       "2026-10-06T18:00:00.000000000Z",
  "precpu_stats": { ...same shape as cpu_stats, previous read... },
  "cpu_stats": {
    "cpu_usage": { "total_usage": 1234567890, "percpu_usage": [...] },
    "system_cpu_usage": 98765432100,
    "online_cpus": 8
  },
  "memory_stats": {
    "usage": 268435456,
    "limit": 536870912,
    "stats": { "total_inactive_file": 12345678, "inactive_file": 12000000, ... },
    "max_usage": 300000000,   // cgroup v1 only
    "failcnt": 0              // cgroup v1 only
  },
  "networks": { "eth0": { "rx_bytes": 90000, "tx_bytes": 260000 } },
  "blkio_stats": { "io_service_bytes_recursive": [ {"op":"read","value":123}, {"op":"write","value":456} ] },
  "pids_stats": { "current": 24, "limit": 512 },
  "storage_stats": { ...optional... },
  "name": "/web-1",
  "id": "5f...",
}
```

### 3.1 The `precpu_stats` trick

The daemon fills `precpu_stats` from the *previous* stats call it served for that
container. That means the first sample after a daemon restart (or the first call
for a container) may have empty/zero `precpu_stats`. Handle it:

- If `precpu_stats.cpu_usage.total_usage == 0` or `system_cpu_usage` is
  `0`/missing, **skip** the CPU computation for that sample and mark CPU as
  unknown (carry the previous value or emit 0 with a flag). Do not divide by
  zero.
- Prefer computing CPU yourself from your own stored previous sample rather than
  relying on `precpu_stats`. That gives a consistent interval and works even if
  another client pounded the stats endpoint between your calls. Use
  `precpu_stats` only as a fallback. **Recommendation: compute from our own
  previous sample.**

---

## 4. Normalization arithmetic

Let `prev` be the previous stored `Sample` for the container, and `cur` a new
normalized sample at time `t`.

### 4.1 CPU (fraction of one core)

```text
cpuDelta    = cur.total_usage        - prev.total_usage
systemDelta = cur.system_cpu_usage   - prev.system_cpu_usage
onlineCpus  = cur.online_cpus ?? len(cur.percpu_usage) ?? 1

cpuPercentOneCore = (cpuDelta / systemDelta) * onlineCpus * 100    # docker stats
cpuFraction       = (cpuDelta / systemDelta) * onlineCpus          # 1.0 == one full core
```

`docker stats` shows *percent of one core*: a single saturated core reads
`100%`, and using all eight cores of an eight-core host reads `800%`. That is
why the formula multiplies by `onlineCpus` — it converts the host-wide ratio
`cpuDelta/systemDelta` into core units. docker-metrics stores the same value
divided by 100, i.e. the **fraction of one core** (`1.0` = one busy core), so a
single busy container reads `1.0` on any machine and `pct` renders it as `100%`
of a core. This is implemented in `CPUFraction` in `pkg/docker/normalize.go` and
locked by `TestCPUFractionIsFractionOfOneCore`.

Guard against a zero `systemDelta` (too-fast consecutive polls):

```text
if systemDelta <= 0 or cpuDelta < 0: cpu = prev.cpu   # keep last known
else:                                cpu = cpuDelta / systemDelta
```

### 4.2 Memory working set

```text
cache =
    memory_stats.stats.total_inactive_file   # cgroup v1
    ?? memory_stats.stats.inactive_file      # cgroup v2
    ?? 0
usage      = memory_stats.usage
workingSet = max(0, usage - cache)
limit      = memory_stats.limit
```

If `limit` is the host's total memory (no `--memory` set), `of("limit")` is less
meaningful; still report it, and let dashboards decide.

### 4.3 Network rates

```text
rx = sum(networks[*].rx_bytes)
tx = sum(networks[*].tx_bytes)
```

These are cumulative and reset if the container restarts (new network
namespace). Detect a decrease (`rx < prev.rx`) and treat it as a reset: emit a
zero rate for that interval, then continue from the new baseline.

### 4.4 Block I/O

```text
io_service_bytes_recursive entries:
    op == "read"  -> add to io.r
    op == "write" -> add to io.w
```

Same reset detection as network. On cgroup v2, `blkio_stats` may be absent
entirely; emit `0` and set a `blockioUnavailable` flag once.

### 4.5 PIDs

```text
pids      = pids_stats.current ?? 0
pidsLimit = pids_stats.limit   ?? 0
```

On cgroup v2, `pids_stats.limit` may be absent; fall back to the configured
`--pids-limit` from `GET /containers/{id}/json` or `0`.

### 4.6 Restarts

`RestartCount` from `/containers/json` is the baseline. Between list refreshes,
increment on `restart` events and on a `die` followed by a `start`. Never derive
restarts from stats.

---

## 5. Events

`GET /events` returns newline-delimited JSON, one object per line:

```json
{"Type":"container","Action":"start","Actor":{"ID":"5f...","Attributes":{"name":"web-1","image":"nginx:1.25"}},"time":1770000000,"timeNano":1770000000000000000}
```

Actions to handle: `start`, `die`, `restart`, `destroy`, `pause`, `unpause`,
`health_status`. Filter server-side when possible:

```text
GET /events?filters={"type":["container"]}
```

The stream is long-lived; reconnect with backoff (`1s,2s,4s,…` capped at 30s)
and resume. Use `since=<lastEventTime>` to avoid gaps.

---

## 6. cgroup v1 vs v2 compatibility

| Field | cgroup v1 | cgroup v2 |
| --- | --- | --- |
| `memory_stats.usage` | set | set |
| `memory_stats.stats.total_inactive_file` | set | **not set** |
| `memory_stats.stats.inactive_file` | may be absent | set |
| `memory_stats.max_usage` | set | not set |
| `memory_stats.failcnt` | set | not set |
| `cpu_stats.cpu_usage.percpu_usage` | set | not set |
| `cpu_stats.online_cpus` | set | set |
| `blkio_stats.io_service_bytes_recursive` | set | other fields unset; this one usually set |
| `pids_stats.limit` | set | sometimes unset |

Implication: the memory-cache lookup must try *both* keys; the CPU `online_cpus`
lookup must not rely on `percpu_usage`; blkio and pids-limit need fallbacks.
Detect the cgroup version once from `/info` and cache it, but do not hard-fail if
a field is missing — degrade gracefully and record a per-host capability set.

---

## 7. Rate limiting and error handling

- Treat `404` on a stats call as "container vanished"; remove it from the poll
  set, do not retry in a loop.
- Treat `500`/`502` as transient; back off that container's polling (exponential
  to a cap) and keep others running.
- A hung socket read must be bounded by a context timeout (2s default).
- Use a per-host semaphore (default 16 concurrent stats calls). Docker serializes
  some operations internally; excess concurrency just queues inside the daemon.

---

## 8. References

- Docker Engine API: <https://docs.docker.com/reference/api/engine/>
- `docker stats` semantics (memory cache explanation):
  <https://docs.docker.com/reference/cli/docker/container/stats/>
- cgroup v2 notes and field availability: the stats endpoint documentation on
  the same site.
- `moby/moby/client`:
  <https://pkg.go.dev/github.com/moby/moby/client>
- `docker/go-sdk` (higher-level):
  <https://github.com/docker/go-sdk>
