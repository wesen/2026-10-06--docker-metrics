.PHONY: all gifs lint lintmax golangci-lint-install glazed-lint-build glazed-lint test build build-bin build-web fmt-check clean tidy docker-lint gosec govulncheck logcopter-generate logcopter-check goreleaser tag-major tag-minor tag-patch release bump-go-go-golems install

BINARY ?= docker-metrics
MODULE ?= github.com/go-go-golems/docker-metrics
CMD_DIR ?= ./cmd/$(BINARY)
GO_PACKAGES ?= ./...
LOGCOPTER_PACKAGES ?= ./cmd/... ./pkg/...

GORELEASER_ARGS ?= --skip=sign --snapshot --clean
GORELEASER_TARGET ?= --single-target
GOLANGCI_LINT_VERSION ?= $(shell cat .golangci-lint-version)
GOLANGCI_LINT_BIN ?= $(CURDIR)/.bin/golangci-lint
GLAZED_LINT_BIN ?= /tmp/glazed-lint
GLAZED_LINT_PKG ?= github.com/go-go-golems/glazed/cmd/tools/glazed-lint
GLAZED_VERSION ?= $(shell GOWORK=off go list -m -f '{{.Version}}' github.com/go-go-golems/glazed 2>/dev/null)
GLAZED_LINT_DIRS ?= ./cmd/... ./pkg/...
GLAZED_LINT_FLAGS ?=

TAPES := $(wildcard doc/vhs/*tape)

all: lint test build

gifs: $(TAPES)
	@for tape in $(TAPES); do vhs < "$$tape"; done

docker-lint:
	docker run --rm -v $(shell pwd):/app -w /app golangci/golangci-lint:$(GOLANGCI_LINT_VERSION) golangci-lint run -v $(GO_PACKAGES)

golangci-lint-install:
	mkdir -p $(dir $(GOLANGCI_LINT_BIN))
	GOBIN=$(dir $(GOLANGCI_LINT_BIN)) GOWORK=off go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)

glazed-lint-build:
	@echo "Building glazed-lint from the selected Glazed module..."
	@if [ -n "$(GLAZED_VERSION)" ] && [ "$(GLAZED_VERSION)" != "(devel)" ]; then \
		echo "Installing $(GLAZED_LINT_PKG)@$(GLAZED_VERSION)"; \
		GOBIN=$(dir $(GLAZED_LINT_BIN)) GOWORK=off go install $(GLAZED_LINT_PKG)@$(GLAZED_VERSION); \
	else \
		echo "Installing $(GLAZED_LINT_PKG) from workspace/module"; \
		GOBIN=$(dir $(GLAZED_LINT_BIN)) GOWORK=off go install $(GLAZED_LINT_PKG); \
	fi

glazed-lint: glazed-lint-build
	GOWORK=off go vet -vettool=$(GLAZED_LINT_BIN) $(GLAZED_LINT_FLAGS) $(GLAZED_LINT_DIRS)

lint: golangci-lint-install glazed-lint-build
	$(GOLANGCI_LINT_BIN) run -v $(GO_PACKAGES)
	GOWORK=off go vet -vettool=$(GLAZED_LINT_BIN) $(GLAZED_LINT_FLAGS) $(GLAZED_LINT_DIRS)

lintmax: golangci-lint-install glazed-lint-build
	$(GOLANGCI_LINT_BIN) run -v --max-same-issues=100 $(GO_PACKAGES)
	GOWORK=off go vet -vettool=$(GLAZED_LINT_BIN) $(GLAZED_LINT_FLAGS) $(GLAZED_LINT_DIRS)

fmt-check:
	$(GOLANGCI_LINT_BIN) fmt --diff

test:
	GOWORK=off go test $(GO_PACKAGES) -count=1

build:
	GOWORK=off go generate ./...
	GOWORK=off go build $(GO_PACKAGES)

build-bin:
	mkdir -p ./dist
	GOWORK=off go build -o ./dist/$(BINARY) $(CMD_DIR)

# Build the React frontend and stage it for go:embed.
build-web:
	cd web && pnpm install && pnpm build
	rm -rf pkg/httpapi/dist
	mkdir -p pkg/httpapi/dist
	cp -R web/dist/. pkg/httpapi/dist/

# Full single-binary build: frontend first, then the Go binary.
build-all: build-web build-bin

clean:
	rm -rf ./dist ./.bin

tidy:
	GOWORK=off go mod tidy

gosec:
	GOWORK=off go install github.com/securego/gosec/v2/cmd/gosec@latest
	gosec -exclude-generated -exclude=G101,G304,G301,G306 -exclude-dir=.history ./...

govulncheck:
	GOWORK=off go install golang.org/x/vuln/cmd/govulncheck@latest
	govulncheck ./...

logcopter-generate:
	GOWORK=off go generate ./...

logcopter-check:
	GOWORK=off go tool logcopter-gen -area-prefix go-go-golems.docker-metrics -strip-prefix $(MODULE) -check $(LOGCOPTER_PACKAGES)

goreleaser:
	GOWORK=off goreleaser release $(GORELEASER_ARGS) $(GORELEASER_TARGET)

tag-major:
	git tag $(shell svu major)

tag-minor:
	git tag $(shell svu minor)

tag-patch:
	git tag $(shell svu patch)

release:
	git push origin --tags
	GOWORK=off GOPROXY=proxy.golang.org go list -m $(MODULE)@$(shell svu current)

bump-go-go-golems:
	@deps="$$(awk '/^require[[:space:]]+github\.com\/go-go-golems\// { print $$2 } /^[[:space:]]*github\.com\/go-go-golems\// { print $$1 }' go.mod | sort -u)"; \
	if [ -z "$$deps" ]; then \
		echo "No github.com/go-go-golems dependencies in go.mod"; \
	else \
		echo "Bumping go-go-golems dependencies:"; \
		echo "$$deps"; \
		for dep in $$deps; do GOWORK=off go get "$${dep}@latest"; done; \
	fi
	GOWORK=off go mod tidy

install:
	GOWORK=off go install $(CMD_DIR)
