# Agent guidelines for go-go-golems Go projects

## Build commands

- Run the template CLI: `GOWORK=off go run ./cmd/docker-metrics`.
- Build: `make build`; build the distributable binary: `make build-bin`.
- Test: `make test`; run one test: `GOWORK=off go test ./pkg/path -run TestName`.
- Generate logging metadata: `make logcopter-generate`; verify it: `make logcopter-check`.
- Lint: `make lint`; format: `gofmt -w $(git ls-files '*.go')`.
- Validate release configuration: `goreleaser check --config .goreleaser.yaml` and `goreleaser check --soft --config .goreleaser.yaml`.

Use `GOWORK=off` for project-local Go commands. Use tmux for long-running servers or interactive smoke tests.

## Project structure

- `cmd/`: binary entry points and command wiring.
- `pkg/`: reusable public packages.
- `examples/`: runnable examples and sample configuration.
- `doc/`: optional product documentation.
- `ttmp/`: docmgr ticket workspaces when documentation management is initialized.

## Go and command boundaries

- Use Glazed for CLI configuration, structured output, and help where the project is a CLI.
- Keep domain packages independent of command-framework concerns.
- Use contexts for cancellation-capable operations and establish interface assertions where a concrete implementation is meant to satisfy an interface.
- Do not add compatibility layers or adapters without an explicit requirement.

## Release boundary

A `v*` tag uses split Linux/macOS GoReleaser builds. Builders may read only a build license through `release-docker-metrics-builder`; the final shared publisher uses `release-docker-metrics-publisher`, caller-repository `GITHUB_TOKEN`, and a short-lived GitHub App token for the fixed Homebrew tap.

Before enabling a generated repository's first tag release, add its immutable repository ID and exact workflow ref to Terraform's `release_publishers` allowlist, then apply a reviewed normal plan. Never add repository Action secrets for GoReleaser, Homebrew, Fury, signing keys, Vault tokens, or arbitrary Vault-path inputs.
