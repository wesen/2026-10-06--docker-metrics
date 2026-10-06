---
Title: Docker Metrics Daemon and React IDE — Analysis, Design and Implementation Guide
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
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: go.mod
      Note: Module github.com/go-go-golems/docker-metrics
    - Path: cmd/docker-metrics/main.go
      Note: Binary entry point
    - Path: AGENT.md
      Note: Project build and structure conventions
ExternalSources:
    - local:dockermetrics-ide-prototype.html
    - local:dockermetrics-ide-v2.html
Summary: Design and implementation guide for a self-contained Go daemon that polls Docker container metrics, streams a live dashboard over WebSocket, exposes Prometheus, and runs user-authored dashboards in a backend go-go-goja JS runtime with a React IDE mode.
LastUpdated: 2026-10-06T15:26:39.450193-04:00
WhatFor: 'One place to understand the whole system: collection, DSL, goja runtime, WebSocket hub, HTTP API, Prometheus, React IDE, and the phased build plan.'
WhenToUse: Start here when onboarding to the project or resuming implementation.
---

# Docker Metrics Daemon and React IDE — Analysis, Design and Implementation Guide

## Overview

`docker-metrics` is a single self-contained Go binary that polls one or more
Docker daemons for container metrics, keeps a bounded in-memory history, computes
derived values and alerts with a JavaScript DSL executed on the backend by
`go-go-golems/go-go-goja`, and serves the results over WebSocket (live dashboard)
and Prometheus. It also ships a React IDE mode for editing, running and saving
dashboards.

The design is anchored on a browser-only prototype
(`sources/local/dockermetrics-ide-prototype.html`) that already defines the DSL,
the UI, and 21 worked presets. The backend moves the prototype's simulation
behind real data while keeping the DSL semantics identical.

## Key Links

- `design-doc/01-analysis-design-and-implementation-guide-for-interns.md` — the
  main intern guide (read this first).
- `reference/01-system-reference-http-websocket-prometheus-and-dashboard-dsl.md`
  — frozen wire contracts and DSL grammar.
- `reference/02-docker-engine-api-and-metrics-collection-notes.md` — Docker API
  endpoints, normalization arithmetic, cgroup compatibility.
- `playbook/01-build-run-and-test-playbook.md` — build/run/test commands.
- `log/01-implementation-diary.md` — chronological record and blockers.
- `tasks.md` — phased task list.
- `sources/local/dockermetrics-ide-prototype.html` — the product specification.
- External sources: see frontmatter `ExternalSources`.

## Status

Current status: **active** — design and analysis delivered; implementation not
started. The GitHub remote repository could not be created from this machine
(missing org permissions); see the diary's "Remaining blockers".

## Topics

- backend
- websocket
- docker
- metrics
- frontend
- react
- prometheus

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design-doc/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbook/ - Command sequences and test procedures
- log/ - Implementation diary
- scripts/ - Temporary code and tooling
- sources/ - Imported external artifacts
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
