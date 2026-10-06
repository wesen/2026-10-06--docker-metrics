# docker-metrics

A self-contained Go daemon that polls Docker container metrics and serves a live
dashboard over WebSocket, with a React IDE mode for editing, running and saving
dashboards and custom metrics.

## What it does

- Polls a local or remote Docker daemon (unix socket, `tcp://` or `ssh://`) for
  container CPU, memory, network, block I/O, process and restart metrics.
- Keeps a bounded in-memory ring buffer per container, computes derived values
  (rates, percentages of limits, quantiles, aggregates) and evaluates alert rules.
- Serves a single Go binary: JSON/HTTP API, `/metrics` Prometheus endpoint and a
  WebSocket feed for the live dashboard.
- Ships a React IDE mode where dashboards and metric expressions can be authored,
  run against the live data and persisted alongside the daemon.

## Install

Releases publish the `docker-metrics` binary through the go-go-golems Homebrew tap:

```bash
brew tap go-go-golems/go-go-go
brew install --cask docker-metrics
```

Or install the current module directly:

```bash
go install github.com/go-go-golems/docker-metrics/cmd/docker-metrics@latest
```

## Quick start

```bash
docker-metrics --help
docker-metrics serve --docker unix:///var/run/docker.sock --listen :8080
```

Then open <http://localhost:8080/> for the live dashboard and
<http://localhost:8080/ide> for the dashboard editor.

## Load testing / demo fleet

The binary has a `load` mode that generates synthetic CPU and memory pressure so
dashboards have interesting, changing data. Run a few instances to exercise the
fleet view, charts and alerts:

```bash
# locally: mixed CPU bursts + memory sawtooth for 30s
docker-metrics load --profile mixed --cpu 1.5 --burst-period 20s --mem-peak 300 --duration 30s

# or the full dockerized test fleet (collector + 4 load generators)
docker compose up --build
#   dashboard http://localhost:8080/   IDE http://localhost:8080/ide
```

Profiles: `cpu` (steady + bursts), `mem` (sawtooth), `leak` (grow to peak and
hold), `mixed` (cpu + sawtooth). See `docker-compose.yml` for the fleet.

## Development

```bash
make lint
make test
make build
make logcopter-check
lefthook install
```

## Documentation

The design and implementation guide for this system lives in the docmgr ticket
workspace under `ttmp/`. Start with the ticket index and read the intern guide.

## License

MIT. See [LICENSE](LICENSE).
