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
