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
