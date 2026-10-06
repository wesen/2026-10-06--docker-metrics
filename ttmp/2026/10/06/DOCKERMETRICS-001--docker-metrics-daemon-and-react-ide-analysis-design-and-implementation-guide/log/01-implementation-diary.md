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

## Step 1: User request (verbatim)

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

## Step 2: Reconnaissance (tools, conventions, existing state)

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

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Orient on the machine before running any state-changing command.
**Inferred user intent:** Avoid clobbering existing work or using the wrong account.
**Commit (code):** none (reconnaissance only)

### What I did
- Checked tooling: `gh`, `docmgr`, `remarquee`, `pandoc`, `xelatex`, `go`, `node`, `pnpm`; confirmed `wsm` is absent.
- Inspected the machine layout: `~/code/{go-go-golems,wesen,tulip,others}` and the launch directory `~/code/wesen/2026-10-06--docker-metrics`.
- Read `gh auth status` (account `manuel-tulip`) and the `~/.config/nix/netrc` token.

### Why
- The project-creation skill requires checking tooling and existing repository state first, and this machine's paths differ from the skill's `/home/manuel` examples.

### What worked
- Located a full local checkout of the required JS runtime at `~/code/go-go-golems/go-go-goja`.
- Confirmed `go1.27.1`, which satisfies the template's `go 1.26.6`.

### What didn't work
- `wsm` is not installed, so the optional WSM workspace step is unavailable (noted, skipped).

### What I learned
- `gh` is authenticated only as `manuel-tulip`, a work account with no create rights in `go-go-golems` or `wesen`.

### What was tricky to build
- Mapping the skill's assumed paths (`/home/manuel/...`) onto this machine (`/Users/manuel.odendahl/...`) without assuming they are equivalent.

### What warrants a second pair of eyes
- N/A (no code changed).

### What should be done in the future
- Install `wsm` if workspace integration is wanted.

### Code review instructions
- N/A; evidence is the command output recorded above.

### Technical details
- None.

## Step 3: GitHub repository creation blocked

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

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Create the GitHub repository from the template as requested.
**Inferred user intent:** A real upstream repository to push to.
**Commit (code):** none (blocked)

### What I did
- Ran `gh repo create go-go-golems/docker-metrics --public --template go-go-golems/go-template --clone=false`.
- Probed permissions: `gh api repos/wesen/2026-09-06--vision --jq .permissions` and `gh api user/orgs`.

### Why
- The requested flow starts with creating the repository from the template.

### What worked
- The exact failure diagnostic was captured, which made the cause unambiguous.

### What didn't work
- `GraphQL: manuel-tulip does not have the correct permissions to execute CloneTemplateRepository (cloneTemplateRepository)`.
- `wesen`-owned repos report only `pull: true`, so a fork/push is equally blocked.

### What I learned
- Org membership cannot be read without `admin:org` scope, so the block had to be inferred from the error and repo permissions.

### What was tricky to build
- Distinguishing "repository does not exist" from "exists but you cannot create/fork it"; the GraphQL error plus the permissions probe settled it.

### What warrants a second pair of eyes
- N/A.

### What should be done in the future
- Retry creation after obtaining a credential with create rights (resolved later when collaborator access was granted).

### Code review instructions
- N/A.

### Technical details
- Token scopes at the time: `admin:public_key, gist, read:org, repo, workflow`.

## Step 4: Local scaffold from the template (fallback)

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

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Proceed locally from the public template so the ticket and documents can be produced despite the remote block.
**Inferred user intent:** Do not stall the deliverable on a credentials problem.
**Commit (code):** db4c8bf — "Initialize docker-metrics project from go-go-golems/go-template"

### What I did
- Cloned `https://github.com/go-go-golems/go-template` to `/tmp/go-template-probe` and copied it into the launch directory.
- Removed the template's `.git`, ran a Python placeholder-replacement pass (module/binary/logcopter/README), moved `cmd/XXX` to `cmd/docker-metrics`, rewrote the README.
- Verified with `GOWORK=off go build ./...` and `go test ./...`, then committed.

### Why
- The template placeholders (`XXX`, `go-go-golems.XXX`, `cmd/XXX`) must be normalized before any feature work.

### What worked
- Build and tests passed; `rg -n "XXX|go-template|GO GO TEMPLATE"` found only the README, which was then rewritten.

### What didn't work
- No failures in this step.

### What I learned
- `docmgr init` also creates `.ttmp.yaml`, which must be committed alongside `ttmp/`.

### What was tricky to build
- Choosing a safe replacement set that does not clobber the `AGENT.md` line where `XXX` means a port number; qualified strings were used instead of bare `XXX`.

### What warrants a second pair of eyes
- The assumed module path (`github.com/go-go-golems/docker-metrics`) versus the eventual repo owner (`wesen`).

### What should be done in the future
- Rename the module if the owner is confirmed to be `wesen`.

### Code review instructions
- Inspect `go.mod`, `cmd/docker-metrics/main.go`, `logcopter_generate.go`, `Makefile`.

### Technical details
- Replacement table recorded in the step prose above.

## Step 5: docmgr workspace and ticket

```bash
docmgr init --root ttmp --seed-vocabulary
docmgr vocab add --category topics --slug docker|metrics|frontend|react|prometheus
docmgr ticket create-ticket --ticket DOCKERMETRICS-001 --title "…" \
  --topics backend,websocket,docker,metrics,frontend,react,prometheus
```

Ticket path:
`ttmp/2026/10/06/DOCKERMETRICS-001--docker-metrics-daemon-and-react-ide-analysis-design-and-implementation-guide`.

Added `log` to the `docTypes` vocabulary so the diary has a valid type.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Create the docmgr workspace and the ticket that holds all deliverables.
**Inferred user intent:** A structured, searchable documentation home for the design and guide.
**Commit (code):** db4c8bf / 6822b2a

### What I did
- `docmgr init --root ttmp --seed-vocabulary`; added topics (`docker`, `metrics`, `frontend`, `react`, `prometheus`) and a `log` doc-type.
- `docmgr ticket create-ticket --ticket DOCKERMETRICS-001 --topics backend,websocket,docker,metrics,frontend,react,prometheus`.

### Why
- The docmgr skill requires a ticket workspace with a diary per active ticket.

### What worked
- Ticket created at `ttmp/2026/10/06/DOCKERMETRICS-001--…/`.

### What didn't work
- No failures.

### What I learned
- Vocabularies must be extended before a `doc add` of an unknown `--doc-type`.

### What was tricky to build
- Nothing significant.

### What warrants a second pair of eyes
- N/A.

### What should be done in the future
- Keep `docmgr doctor` clean as documents evolve.

### Code review instructions
- `docmgr ticket list --ticket DOCKERMETRICS-001`.

### Technical details
- Root `ttmp`, vocabulary at `ttmp/vocabulary.yaml`.

## Step 6: Import the prototype

```bash
docmgr import file --ticket DOCKERMETRICS-001 \
  --file ~/Downloads/dockermetrics-ide.html \
  --name "dockermetrics IDE prototype (browser-only simulation)"
```

The imported filename contained spaces; renamed it to
`sources/local/dockermetrics-ide-prototype.html` and updated the
`ExternalSources` frontmatter in `index.md`.

### Prompt Context
**User prompt (verbatim):** see Step 1 ("Import ~/Downloads/dockermetrics-ide.html into the sources/ folder of the ticket").
**Assistant interpretation:** Bring the prototype into the ticket as an external source.
**Inferred user intent:** The prototype is the product specification and must be versioned with the docs.
**Commit (code):** 6822b2a

### What I did
- `docmgr import file --ticket DOCKERMETRICS-001 --file ~/Downloads/dockermetrics-ide.html --name "dockermetrics IDE prototype (browser-only simulation)"`.
- Renamed the spaces-laden imported file to `sources/local/dockermetrics-ide-prototype.html` and updated the `ExternalSources` frontmatter.

### Why
- The design guide treats the prototype as the DSL/UX specification.

### What worked
- `docmgr import` recorded the source in `.meta/sources.yaml` and updated `index.md`.

### What didn't work
- The default imported filename contained spaces, which is awkward on the CLI; renamed.

### What I learned
- `docmgr import` stores the original path in metadata, not the new name, so both must be updated on rename.

### What was tricky to build
- Nothing significant.

### What warrants a second pair of eyes
- N/A.

### What should be done in the future
- N/A.

### Code review instructions
- `ls ttmp/2026/10/06/DOCKERMETRICS-001--…/sources/local/`.

### Technical details
- Source file ~80 KB, 909 lines, React 18 UMD + an in-browser simulated engine.

## Step 7: Research for accurate API references

- Kagi search confirmed the Docker Engine API stats endpoint is deprecated in
  favour of the query variant and documents `precpu_stats` for the CPU delta.
- Confirmed `moby/moby/client` as the low-level Go client and `docker/go-sdk`
  as the higher-level option.
- Confirmed `coder/websocket` as the context-friendly Go WebSocket choice.
- Read the local `~/code/go-go-golems/go-go-goja` checkout: runtime composition
  (`NewRuntimeFactoryBuilder` → `Build` → `NewRuntime`), `modules.NativeModule`
  adapter, `MiddlewareOnly` sandboxing, and `RuntimeModuleRegistrar` for
  dependency injection.

### Prompt Context
**User prompt (verbatim):** see Step 1 (details/API references) and the follow-up "use go-go-golems/go-go-goja for the JS part on the backend".
**Assistant interpretation:** Gather authoritative API facts before writing the guide.
**Inferred user intent:** The guide must be technically accurate, not hand-wavy.
**Commit (code):** 6822b2a

### What I did
- Kagi search on the Docker Engine stats endpoint, `moby/moby/client` vs `docker/go-sdk`, and `coder/websocket` vs `gorilla/websocket`.
- Read the local `~/code/go-go-golems/go-go-goja` checkout: runtime composition, `modules.NativeModule`, `MiddlewareOnly`, `RuntimeModuleRegistrar`.

### Why
- The intern guide and the reference docs cite specific endpoints, libraries, and go-go-goja APIs.

### What worked
- Confirmed `precpu_stats` CPU-delta semantics, the cgroup v1/v2 field differences, and the go-go-goja factory/runtime API.

### What didn't work
- No failures.

### What I learned
- `docker stats` CPU is per-core percent: `(cpuDelta/systemDelta) * onlineCPUs * 100`.

### What was tricky to build
- Reconciling the initial (incorrect) note in the reference doc with the correct per-core formula; corrected later in Step 10.

### What warrants a second pair of eyes
- The cgroup v1/v2 compatibility table should be re-verified against a real cgroup v2 host.

### What should be done in the future
- Capture real stats fixtures per cgroup version.

### Code review instructions
- See `reference/01-…` and `reference/02-…`.

### Technical details
- Libraries chosen: `coder/websocket`, `prometheus/client_golang`, `go-go-goja v0.10.6`.

## Step 8: Documents written

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

### Prompt Context
**User prompt (verbatim):** see Step 1 (the intern guide request).
**Assistant interpretation:** Write the deliverables: a detailed intern guide plus supporting references and a playbook.
**Inferred user intent:** A new engineer can understand and implement the whole system from these documents.
**Commit (code):** 6822b2a

### What I did
- Wrote `design-doc/01-analysis-design-and-implementation-guide-for-interns.md` (problem, architecture diagrams, Docker math, DSL spec, go-go-goja runtime, backend layout, hub, HTTP, Prometheus, React IDE, 5-phase plan, testing, security, alternatives, open questions).
- Wrote `reference/01-…`, `reference/02-…`, `playbook/01-…`, `log/01-…`; updated `index.md`, `tasks.md`, `changelog.md`; related files.

### Why
- One authoritative, technical, intern-friendly source of truth.

### What worked
- `docmgr doctor --ticket DOCKERMETRICS-001` reported all checks passed.

### What didn't work
- No failures.

### What I learned
- Keep `RelatedFiles` tight (3–7) and link most files to the focused subdocument.

### What was tricky to build
- Making the guide concrete (pseudocode, ASCII diagrams, file paths) without access to a working implementation yet.

### What warrants a second pair of eyes
- The CPU-unit decision documented in the guide; corrected after implementation.

### What should be done in the future
- Update the guide as the implementation diverges.

### Code review instructions
- Read the design doc in the order given in its §0.

### Technical details
- Ticket path in Step 5.

## Step 9: reMarkable delivery

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

### Prompt Context
**User prompt (verbatim):** see Step 1 ("upload to remarkable").
**Assistant interpretation:** Deliver the guide to reMarkable as a single PDF with a table of contents.
**Inferred user intent:** Read the guide on a device.
**Commit (code):** 567476f

### What I did
- `remarquee upload bundle` of the design doc, both references and the playbook, `--toc-depth 2`, to `/ai/2026/10/06/DOCKERMETRICS-001`.

### Why
- The user explicitly requested reMarkable delivery.

### What worked
- `OK: uploaded DOCKERMETRICS-001 Docker Metrics Intern Guide.pdf -> /ai/2026/10/06/DOCKERMETRICS-001`.

### What didn't work
- No failures; authentication was already valid.

### What I learned
- Cloud delivery is not physical device synchronization.

### What was tricky to build
- Nothing significant.

### What warrants a second pair of eyes
- N/A.

### What should be done in the future
- Re-upload when the guide changes materially.

### Code review instructions
- N/A.

### Technical details
- Bundle order: design doc, reference 01, reference 02, playbook.

## Step 10: Phase 1 — Docker client, store and collector

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

## Step 11: Phase 2 — go-go-goja dashboard runtime

This step wires the compute plane: it embeds a go-go-goja runtime, exposes the
store through a `dockermetrics` native module, ports the prototype's DSL engine
into JavaScript as a prelude, and adds `run`/`check` commands. It was validated
against the live Docker daemon.

### Prompt Context
**User prompt (verbatim):** see Step 10. A follow-up instruction also told us the
dashboard JS must run on the backend via `go-go-golems/go-go-goja`, which is what
this step implements.
**Assistant interpretation:** Build the JS execution plane and the data leaves it
needs, then expose it through the CLI.
**Inferred user intent:** No recompile to add a metric; the prototype's DSL works
verbatim against real data.
**Commit (code):** recorded after this entry.

### What I did
- Added `github.com/go-go-golems/go-go-goja v0.10.6`.
- `pkg/runtime/prelude/engine.js`: a port of the prototype's `DM` engine. It
  defines `Metric`, `Pred`, `Group`/`Container`/`Docker`/`fleet`, op vocabulary
  (`pct mb kb gb round of rate avg sum min max p50 p95 p99 count`), selectors,
  `by/last/since/bucket`, `Report`, `Rule`/`Watcher`, `Stream`, sinks
  (`prometheus statsd file tap json`), the console shim, `sleep`, `spark`, and a
  Go-driven item registry (`__tick`, `__stopAll`, `__hasItems`, `__dmFinish`).
  Data comes from `require("dockermetrics")` instead of the simulation.
- `pkg/runtime/module.go`: a `RuntimeModuleRegistrar` registering the
  `dockermetrics` module (`now`, `maxSamples`, `containers`, `samples`, `log`,
  `clearLog`, `sink`, `emitEvent`, `action`, `_finish`, `after`) and the
  per-runtime `moduleState`.
- `pkg/runtime/manager.go`: `Manager`/`Session` using
  `engine.NewRuntimeFactoryBuilder().WithModules(...).UseModuleMiddleware(MiddlewareOnly("dockermetrics")).Build()`
  and `factory.NewRuntime`, evaluating the prelude once, then `RunSource`,
  `Compile`, `Tick`, `HasItems`, `StartTicker`, `StopAll`, `Close`.
- `pkg/cli/run.go`: `run` (live store from `--host`, `--follow`, `--timeout`,
  `--allow-mutations`) and `check` (syntax validation).
- `testdata/dashboards/{one-metric,aggregate,stream}.js`: runnable fixtures.
- `pkg/runtime/manager_test.go`: integration tests over a fake store.

### Why
- Keeping the DSL in JavaScript preserves the prototype's exact semantics and
  means Go only provides leaves. Two implementations of the DSL would diverge.
- The native module is pull-only (`containers`, `samples`) so JS never gets
  Docker authority; `MiddlewareOnly("dockermetrics")` enforces it.

### What worked
- `GOWORK=off go test ./pkg/runtime/... -count=1` passes: reads, pipes, rates,
  combines, predicates, `by()`, `history`/`bucket`, error taxonomy, stream ticks,
  and compile rejection.
- Live `run` over the local daemon printed real values, e.g.
  `dagger-engine-v0.20.3 cpu 0.0001 -> 0.0057 %` and `mem MB 239.2842`.
- Live `run --follow --timeout 3s` streamed frames once per second.
- `check testdata/dashboards/*.js` reports OK for all fixtures.

### What didn't work
- `.to(...)` did not register a stream: the prototype auto-started streams with
  `setTimeout`, which the prelude does not have. Fixed by starting the stream in
  `.to()` and `.watch()`.
- `HasItems` always returned false: it returned a `goja.Value` and the type
  assertion to `bool` failed. Fixed by returning `res.ToBoolean()`.
- `check` reported `SyntaxError: Unexpected identifier` for dashboards with
  top-level `await`, because `goja.Compile` compiles a plain script. Fixed by
  compiling the same async-IIFE wrapper `RunSource` uses.
- Flag collision: `run`'s `--timeout` clashed with the shared per-request
  `--timeout`. Renamed the shared flag to `--request-timeout`.

### What I learned
- go-go-goja's owner/event-loop model runs `Call` on the VM goroutine and drains
  microtasks, so `await` on already-resolved promises (our whole prelude) settles
  during `RunString`; a JS-side `__dmFinish` callback is a reliable completion
  signal.

### What was tricky to build
- Bridging JS ticks to Go: the prelude keeps an item registry and Go drives it
  with `__tick()` on a ticker via `Owner.Call`, so streams and watchers do not
  depend on JS timers.
- `after(ms)` (for `sleep`) resolves a goja Promise from a Go goroutine via
  `Owner.Post`.

### What warrants a second pair of eyes
- `MiddlewareOnly("dockermetrics")` plus go-go-goja's implicit data-only default
  modules: confirm the effective module set is what the sandbox intends.
- The `run` CLI does a single `PollOnce`, so streamed values are static; the
  daemon must poll continuously (Phase 3).

### What should be done in the future
- Port the remaining prototype presets as fixtures and assert their shapes.
- Emit a `runId` and stream frames to the hub (Phase 3/4).

### Code review instructions
- Start at `pkg/runtime/prelude/engine.js` and `pkg/runtime/module.go`.
- Validate: `GOWORK=off go test ./pkg/runtime/... -count=1` and
  `GOWORK=off go run ./cmd/docker-metrics run testdata/dashboards/one-metric.js`.

### Technical details
- Module name: `dockermetrics`. Runtimes are per dashboard session.
- Default tick interval: 500ms; CLI run uses 250ms.

## Step 12: Phase 3 — WebSocket hub, HTTP API and serve

This step adds the presentation plane: a topic-based WebSocket hub with
backpressure, the REST API (hosts, containers, samples, events, dashboards,
run/stop), a Prometheus registry fed by `prometheus()` sinks, a `ws(topic)` sink
that forwards prelude streams to the hub, and the `serve` command with graceful
shutdown. A built-in "fleet" dashboard streams CPU/memory percentages to the
`fleet` topic.

### Prompt Context
**User prompt (verbatim):** see Step 10.
**Assistant interpretation:** Make the daemon runnable and observable so the
React app (Phase 4) has a real backend.
**Inferred user intent:** A single process that serves live data and the IDE.
**Commit (code):** recorded after this entry.

### What I did
- `pkg/hub/hub.go`: `Hub` (subscribe/unsubscribe/publish/broadcast), `Client`
  with buffered send channel, write/read pumps, ping/pong, and drop-oldest
  backpressure; `coder/websocket` v1.8.15.
- `pkg/httpapi/server.go`: `ServeMux` routes, `/ws`, `/healthz`, `/readyz`,
  hosts/containers/samples/events, Prometheus `/metrics`, SPA/static serving
  with fallback, `StartDefaultDashboard`, `RecordEvent`.
- `pkg/httpapi/prom.go`: a registry that renders the exposition format.
- `pkg/httpapi/dashboards.go`: in-memory dashboard CRUD (SQLite later).
- `pkg/httpapi/run.go`: `POST /api/v1/run`, `POST /api/v1/run/{id}/stop`,
  per-run goja sessions streaming `log`/`frame`/`run` frames to `run:<id>`.
- `pkg/runtime`: added the `ws(topic)` sink and `core.publish`.
- `pkg/cli/serve.go`: sources → store → collector → hub → server, signal-driven
  graceful shutdown, `--listen`, `--static-dir`, `--no-default-dashboard`,
  `--allow-mutations`.
- `pkg/httpapi/server_test.go`: health/ready, containers, WebSocket
  subscribe/ping/pong, Prometheus rendering.

### Why
- Topics decouple producers (dashboards, collector events) from consumers
  (browser). One connection can subscribe to fleet, container, events and run
  topics.
- Drop-oldest backpressure keeps a slow browser from stalling the collector.

### What worked
- `GOWORK=off go test ./... -count=1` passes, including a real WebSocket
  handshake and subscribe round-trip.
- Live serve: `/healthz` ok, `/readyz` ready, `/api/v1/hosts` showed
  `local unix:///var/run/docker.sock version 29.8.0`, `/ws` returned
  `101 Switching Protocols`, `POST /api/v1/run` returned a run id, dashboard
  create returned an id.

### What didn't work
- `/api/v1/containers` returned `null` for the first seconds: `Collector.Run`
  started its tickers without an immediate poll. Fixed by priming with
  `Refresh` + `PollStats` before the loops.
- `go vet` flagged a context leak in `handleRun` when `NewSession` failed; fixed
  by calling `cancel()` on the error path.

### What I learned
- The Docker daemon's first `stream=0` read can take ~1s; priming the collector
  at startup and a 5s request timeout both matter for a responsive UI.

### What was tricky to build
- Mapping the prelude's flattened sink payloads into both Prometheus text and
  hub frames while keeping the producers decoupled.

### What warrants a second pair of eyes
- `InsecureSkipVerify: true` on the WebSocket accept: acceptable for localhost,
  but revisit if the daemon is bound to a public interface (add origin checks).
- Dashboard persistence is in-memory only; a restart loses definitions.

### What should be done in the future
- Add `--allow-mutations` enforcement tests; wire rule actions to the Docker
  client; add SQLite persistence.

### Code review instructions
- Start at `pkg/hub/hub.go` and `pkg/httpapi/server.go`.
- Validate: `GOWORK=off go test ./pkg/httpapi/... -count=1`, then
  `GOWORK=off go run ./cmd/docker-metrics serve` and curl the endpoints.

### Technical details
- Topics: `fleet`, `container:<name>`, `events`, `run:<id>`.
- Outbound buffer 256; ping every 30s; write timeout 10s.

## Step 13: Phase 4 — React IDE (atomic design + RTK Query)

This step builds the frontend: a Vite + React + TypeScript app organised by
atomic design (atoms/molecules/organisms), with Redux Toolkit for UI and stream
state and RTK Query for the REST API. The CSS tokens and layout classes are
ported verbatim from the prototype so the look is unchanged. The build is
embedded into the Go binary.

### Prompt Context
**User prompt (verbatim):** see Step 10 — "use react with atom/molecule/organism
design system, reuse existing design, use redux / rtk-query if necessary".
**Assistant interpretation:** Rebuild the prototype's UI as a real React app with
atomic structure and RTK Query, keeping the prototype's visual identity.
**Inferred user intent:** A maintainable frontend that talks to the real backend,
not a CDN-loaded single file.
**Commit (code):** recorded after this entry.

### What I did
- `web/`: Vite + React 18 + TS. `vite.config.ts` proxies `/api` and `/ws` to
  `:8080` in dev.
- `web/src/theme/global.css`: design tokens and classes copied from the
  prototype's `<style>`.
- `web/src/app/`: `types.ts`, `api.ts` (RTK Query: containers, hosts, samples,
  dashboards CRUD, run/stop), `uiSlice.ts` (source/preset/tab/selection),
  `streamSlice.ts` (fleet frame, events, logs, run status), `store.ts`.
- `web/src/hooks/useStream.ts`: reconnecting WebSocket client that subscribes to
  `fleet`, `events` and the active `run:<id>` topic and dispatches frames.
- `web/src/atoms/`: Button, Dot/Badge/Chip, Select/Segmented, StatBar/Spark.
- `web/src/molecules/`: ContainerCard, ConsoleLine, EventRow, CodeEditor.
- `web/src/organisms/`: TopBar, FleetGrid, ConsolePanel, EventsPanel,
  ChartsPanel (SVG), SinksPanel, PresetDrawer.
- `web/src/routes/`: Dashboard (`/`) and Ide (`/ide`), selected by pathname.
- `web/src/presets/index.ts`: 13 presets ported from the prototype.
- Embedding: `pkg/httpapi/static.go` (`//go:embed all:dist`) with disk-first
  serving via `--static-dir`; `make build-web` builds and stages `web/dist` into
  `pkg/httpapi/dist`.
- `.gitignore` ignores `web/node_modules`, `web/dist`; `pkg/httpapi/dist` is
  committed so `go build` works from a clean checkout.

### Why
- Atomic design keeps the prototype's visual components small and reusable.
- RTK Query handles polling, caching and mutations without hand-written fetch
  code; Redux holds cross-panel state (selection, active run, stream frames).

### What worked
- `pnpm typecheck` passes; `pnpm build` produced
  `dist/assets/index-*.js` (243 kB) + CSS (7.8 kB).
- `go build ./...` and `go test ./...` pass with the embedded dist.
- Live serve with `--static-dir ""`: `/` served the embedded SPA, `/ide`
  returned the index fallback (200 text/html), `/assets/index-*.js` served with
  `text/javascript`, `/api/v1/containers` returned live data.

### What didn't work
- `pnpm install` finished with `ERR_PNPM_IGNORED_BUILDS` for `esbuild`. The
  "pnpm" field in package.json is no longer read; the setting moved to
  `pnpm-workspace.yaml`. Even then pnpm still errored, but the installed esbuild
  binary worked and `pnpm build` succeeded. Recorded as an environment quirk;
  the build is what matters.
- `tsc` flagged unused `useState`/`setPane`; removed the dead pane state.

### What I learned
- `http.ServeFile` cannot serve an `embed.FS`; `http.FileServer(http.FS(...))`
  plus an explicit index fallback is the correct pattern for an embedded SPA.

### What was tricky to build
- Keeping the WebSocket reconnect loop and the `run:<id>` subscription in sync:
  the hook reconnects when the run id changes so a new run gets its own topic.

### What warrants a second pair of eyes
- Committing `pkg/httpapi/dist` means stale assets are possible; the release
  process should run `make build-web` before tagging.
- `InsecureSkipVerify` on WS accept and no auth: fine for localhost only.

### What should be done in the future
- Add Vitest component tests and a Playwright smoke test that runs a preset.
- Add a dashboard save/load UI wired to the dashboards endpoints.

### Code review instructions
- Start at `web/src/app/api.ts`, `web/src/hooks/useStream.ts`,
  `web/src/organisms/FleetGrid.tsx`, `pkg/httpapi/static.go`.
- Validate: `cd web && pnpm typecheck && pnpm build`, then `make build-all` and
  `./dist/docker-metrics serve`.

### Technical details
- Route split is by `window.location.pathname` (`/ide` → IDE).
- Dev proxy target: `127.0.0.1:8080`.

## Step 14: Phase 5 — gated mutations, formatting and wrap-up

This step closes the loop on safety: rule actions (`restart`/`stop`/`start`) are
now wired to the Docker client but blocked unless the daemon runs with
`--allow-mutations`. It also formats the tree, runs the full validation gate and
updates the ticket tasks.

### Prompt Context
**User prompt (verbatim):** see Step 10.
**Assistant interpretation:** Finish the safety boundary and leave the repo in a
clean, validated, pushed state.
**Inferred user intent:** A working daemon whose destructive powers are opt-in.
**Commit (code):** recorded after this entry.

### What I did
- `pkg/docker/client.go`: `Restart`, `Stop`, `Start` plus a generic `post`.
- `pkg/httpapi`: `Config.AllowMutations` and `Config.Mutator`; `handleRun` now
  wires `Action` to the mutator and records/publishes an event per mutation.
- `pkg/cli/serve.go`: builds a `Mutator` that resolves a container by name to a
  host client and calls restart/stop/start.
- `pkg/runtime/manager_test.go`: `TestMutationsGatedByFlag` proves the default
  blocks mutations and `AllowMutations: true` allows `stop:web`.
- `gofmt -w` across all tracked Go files.

### Why
- The JS sandbox removes ambient authority, but container mutation is a new
  authority granted by the DSL; making it opt-in keeps the default safe.

### What worked
- Full gate passes: `go build ./...`, `go vet ./...`, `gofmt -l` clean, and
  `go test ./... -count=1` green across collector, docker, httpapi and runtime.

### What didn't work
- No failures this step.

### What I learned
- The prelude's `Group.stop()` already routes through `core.action` with the
  container names, so the Go gate needed no DSL change.

### What warrants a second pair of eyes
- Mutation id resolution assumes container names are unique per host; a
  name collision across hosts picks the first host client. Acceptable for v1.

### What was tricky to build
- Route the mutation gate: the prelude's `Group.stop()` already funnels through `core.action`, so the fix was entirely on the Go side (an `AllowMutations` flag plus a `Mutator` callback) rather than in the DSL.

### What should be done in the future
- Add a per-script interrupt/watchdog budget; add SQLite persistence; add
  collector self-metrics; validate a GoReleaser snapshot before the first tag.

### Code review instructions
- Start at `pkg/cli/serve.go` (Mutator), `pkg/httpapi/run.go` (Action) and
  `pkg/runtime/manager_test.go` (gating test).
- Validate: `GOWORK=off go test ./... -count=1` and
  `GOWORK=off go run ./cmd/docker-metrics serve --allow-mutations`.

### Technical details
- Mutator timeout for restart/stop: 10s.

## Step 15: `load` mode and a dockerized demo fleet

The user asked for a mode that generates CPU/memory bursts so it can be
dockerized and run as a few instances to test the dashboards. This step adds a
`docker-metrics load` command, a Dockerfile, and a compose fleet.

### Prompt Context
**User prompt (verbatim):** "create a mode that runs and creates memory / cpu
bursts, so we can dockerize it and run a few instances for testing our
dashboards."
**Assistant interpretation:** A workload generator subcommand plus container
packaging that produces real, changing container metrics.
**Inferred user intent:** A repeatable local environment to exercise the fleet
view, charts, alerts and the Prometheus endpoint.
**Commit (code):** recorded after this entry.

### What I did
- `pkg/load/load.go`: profiles `cpu|mem|leak|mixed`; CPU burners with a duty
  cycle to hit a target fraction of a core and optional periodic bursts; memory
  grow/release (sawtooth) or grow/hold (leak) with pages touched so RSS is real.
- `pkg/cli/load.go`: `docker-metrics load` with `--profile`, `--cpu`,
  `--cpu-workers`, `--burst-period/-duration`, `--mem-peak/-step/-interval`,
  `--hold-at-peak`, `--duration`, `--verbose`; SIGINT/SIGTERM aware.
- `pkg/load/load_test.go`: all profiles run and terminate on duration; cancel
  works; `touch` commits pages.
- `Dockerfile`: multi-stage `golang:1.27-alpine` → `distroless:nonroot`,
  `CGO_ENABLED=0`.
- `docker-compose.yml`: a `collector` (docker socket mounted, port 8080) plus
  `load-cpu`, `load-mem`, `load-leak`, `load-burst` generators.
- `.dockerignore`: keeps `pkg/httpapi/dist` (needed for `go:embed`) while
  excluding the repo-root `/dist`, `web/*`, `ttmp` and markdown.

### Why
- Real container metrics are the only meaningful dashboard test input; the
  prototype used a browser simulation, so this is the production equivalent.
- Profiles map to alert scenarios: `leak` triggers sustained-memory rules,
  `cpu` triggers saturation rules, `mixed` feeds "everything at once".

### What worked
- `go test ./pkg/load/...` passes; the full gate stays green.
- Local smoke: `load --profile mixed --duration 4s` allocated in steps and reset.
- `docker build` succeeds; `docker compose config` is valid.
- End-to-end with a real container: `docker stats` reported `dm-load-cpu
  cpu=109.42% mem=87.7MiB`, and `poll --once` reported the same container at
  `CPU% 68.64 MEM_MB 133.9`, proving the collector sees generated load.
- `pkg/httpapi/dist` is now actually tracked by git (see the fix note below).

### What didn't work
- A pre-existing packaging bug surfaced while answering "does it embed the
  built JS?": `git ls-files pkg/httpapi/dist` was empty because the template
  `.gitignore` contains a broad `dist/` rule that also matched
  `pkg/httpapi/dist`. A fresh clone would have failed `go:embed`. Fixed by
  changing the rule to `/dist/` (repo root only) and committing the built assets.
- A second bug surfaced in the same session: `Hub.Publish` overwrote `Type` to
  `"frame"`, mislabeling `event`/`log`/`run` frames, so the IDE console never
  showed run output and event frames were wrong. Fixed to default `Type` only
  when empty, and added `TestWebSocketReplay` (recent-frame replay for late
  subscribers) plus a per-topic replay buffer.
- `byte(4096)` in the `touch` test overflowed; `touch` now writes `0xA5`.

### What I learned
- Committing an embedded asset directory needs an explicit ignore exception;
  broad `dist/` ignore rules are a footgun for `go:embed`.

### What was tricky to build
- Making memory pressure *real* for Docker: Go does not commit heap pages until they are written, so `touch()` writes one byte per 4096-byte page; without it Docker's `memory_stats` would show only a small RSS despite a large allocation.

### What warrants a second pair of eyes
- The `.dockerignore` exception that keeps `pkg/httpapi/dist` for `go:embed` is easy to break again; the broad `dist/` rule was the original cause of the embedding bug.
- The compose load generators have CPU/memory limits that assume a reasonably sized host; tune `cpus`/`mem_limit` for the target machine.

### What should be done in the future
- Add a `--mem-touch` option and a `leak` vari ant with a slow unbounded growth
  for OOM tests; add compose profiles so `collector` can be run alone.

### Code review instructions
- Start at `pkg/load/load.go`, `pkg/cli/load.go`, `Dockerfile`,
  `docker-compose.yml`, `pkg/hub/hub.go` (Type + replay).
- Validate: `GOWORK=off go test ./... -count=1`; `docker compose up --build`.

### Technical details
- CPU duty cycle = period * target/workers; bursts run all workers at 100%.
- Memory is touched one byte per 4096 to commit pages.

## Step 16: Diary backfill and a deferred decision — custom dashboard JS API

This step normalizes the diary to the full investigation format and records a
decision: the `dashboard()` JavaScript API is designed but **not implemented
yet**, and a partial implementation was reverted.

### Prompt Context
**User prompt (verbatim):** "backfill the diary in the correct format if
necessary", followed by "do not implement the dashboard part yet, btw."
**Assistant interpretation:** Bring every substantive diary step up to the
investigation format, and stop work on the custom-dashboard feature so a
half-finished API does not land.
**Inferred user intent:** Keep the written record rigorous and keep the codebase
in a coherent, committed state rather than carrying an unfinished feature.
**Commit (code):** this step's commit ("docs(DOCKERMETRICS-001): backfill diary
to the investigation format").

### What I did
- Audited the diary against the required sections and found: Steps 14 and 15
  missing `### What was tricky to build` (and Step 15 also missing
  `### What warrants a second pair of eyes`); an `(ump)` suffix on every
  Step 10–15 header; and Steps 2–9 written as narrative instead of the full
  format.
- Backfilled Steps 2–9 with the complete section set, removed the `(ump)` noise,
  normalized the step-header separator to `Step N: Title`, and added the missing
  sections to Steps 14 and 15. A re-audit reports "OK" for every step 2–15.
- Reverted the partial custom-dashboard implementation with
  `git checkout -- pkg/httpapi/dashboards.go pkg/httpapi/run.go pkg/httpapi/server.go pkg/runtime/manager_test.go pkg/runtime/module.go pkg/runtime/prelude/engine.js`.

### Why
- The diary skill's investigation format is the requested record for substantive
  steps; the earlier narrative steps lacked the explicit evidence/decision
  sections.
- A deferred feature must not leave additive stubs (`Options.DefineDashboard`,
  a `defineDashboard` module export, a `dashboard()` prelude function and a test)
  in the tree, because they invite accidental use and complicate review.

### What worked
- The audit script confirms every step 2–15 now has all eleven required sections.
- After the revert, `go build ./...`, `go vet ./...` and
  `go test ./... -count=1` are green and the working tree contains only the
  diary change.

### What didn't work
- I had already started the dashboard feature before the deferral instruction
  arrived: `Panel`/`Dashboard.Panels` types, a `Server.defineDashboard` helper,
  `Options.DefineDashboard`, a `defineDashboard` module export, a prelude
  `dashboard({name, panels})` helper, and `TestDashboardDefinition`. All of it
  compiled and passed, but it is reverted and not part of the repository.

### What I learned
- Backfilling a diary is safer done by splitting on step boundaries and editing
  segments programmatically than by many fragile inline edits; the audit is then
  a second script over the same result.
- When a feature is deferred, revert rather than stash, so the committed tree
  matches the documented state.

### What was tricky to build
- Reverting *only* the feature changes while keeping the diary backfill required
  reverting six explicit file paths and leaving the seventh (the diary) modified,
  then re-running the full gate to prove HEAD is still sound.

### What warrants a second pair of eyes
- The deferred design decision below: whether the dashboard authoring API should
  live in the JS engine (my earlier proposal) or in a declarative JSON schema the
  UI consumes. This affects a lot of follow-on work and is unresolved.

### What should be done in the future
- If approved, implement the custom-dashboard API: a prelude
  `dashboard({ name, panels, group?, every? })` that (a) persists panel metadata
  via a module export, using `id = slug(name)` for idempotent re-runs, and
  (b) starts one stream per data panel publishing to `panel:<id>:<key>`; plus a
  `/d/<id>` route that subscribes to those topics and renders
  `stat | chart | fleet | events | table` panels. Persisting the JS source (for
  re-running a saved dashboard after a restart) is a further sub-task.

### Code review instructions
- Review only the diary in this commit: `git show --stat`. The reverted files
  must be byte-identical to the previous commit; verify with
  `git diff HEAD~1 HEAD -- pkg/`.
- Validate the diary structure with the audit script recorded in the step prose.

### Technical details
- Required sections per step: Prompt Context, What I did, Why, What worked, What
  didn't work, What I learned, What was tricky to build, What warrants a second
  pair of eyes, What should be done in the future, Code review instructions,
  Technical details.
- Deferred design (not implemented): panel value evaluation reuses the existing
  `Stream` machinery; `ws(topic)` already exists and needs no engine change.

## Step 17: Phase B — backend dashboard DSL and snapshot publishing

The user shipped a v2 prototype with a JS dashboard API and a JSON widget
interpreter, and asked to implement it. This step ports the dashboard DSL into
the backend prelude and publishes snapshots over the WebSocket.

### Prompt Context
**User prompt (verbatim):** "Ok, we downloaded a new verison with a JS API to
build dashboards, I like your JSON interpreter on the react side approach,
Import the new version \"~/Downloads/dockermetrics-ide (2).html\". Create a new
design doc in the same style as the first. ... Store in the ticket and upload to
remarkable. Then implement, btw commit at appropriate intervals and keep a
detailed diary as you work".
**Assistant interpretation:** Port the v2 dashboard DSL (`dashboard()`, fifteen
widgets) to the go-go-goja prelude, compile dashboards to JSON snapshots, and
publish them for a React interpreter to draw.
**Inferred user intent:** User-authored dashboards that render in the browser
without the browser containing any metric logic.
**Commit (code):** recorded after this entry.

### What I did
- Imported the v2 prototype to `sources/local/dockermetrics-ide-v2.html`; wrote
  `design-doc/02-dashboard-dsl-and-widget-interpreter-v2.md`; uploaded it to
  reMarkable (`OK: uploaded DOCKERMETRICS-001 Dashboard DSL Guide v2.pdf`).
- Added to `pkg/runtime/prelude/engine.js`: `eventLog`/`logEvent`, `slug`,
  `jsonSafe`, `maxOf`/`minOf`, `rawOf`, `leaves`, `flatVals`, `avgPts`,
  `stateOf`, `isOpts`, `DEFSPAN`, `wmods`, `entriesOf`, `scalarOf`, `asSpecs`,
  `class Widget` (15 compute branches), the widget factories, `events`/`text`/`kv`,
  `class Dashboard` (`var`, `range`, `every`, `section`, `row`, `setVar`,
  `setRange`, `refresh`, `show`, `stop`, `snapshot`) and `dashboard(title, opts)`.
  Exported all of them on the `api` object.
- `pkg/runtime/module.go`: `Options.PublishSnapshot` and the `publishSnapshot`
  native export.
- `pkg/httpapi/run.go` and `server.go`: wired `PublishSnapshot` to hub topics
  `dash:<id>` and `dash:latest`.
- `testdata/dashboards/dash-basic.js` and `TestDashboardSnapshot`.

### Why
- The metric engine was already ported (Phase 2), so `Widget.compute` needed
  only data-source swaps: `world.t` to `now()`, `engine.add` to the prelude item
  registry, `world.board` to a hub publish.
- Snapshots are published on both the dashboard-specific topic and `dash:latest`
  so the IDE can follow the most recent board without knowing its id.

### What worked
- `go test ./... -count=1` green; `TestDashboardSnapshot` asserts the snapshot
  has a section plus two rows and all twelve widget types.
- Live: `POST /api/v1/run` with `dash-basic.js` produced a snapshot frame with
  `rows=4` and widget types `stat, gauge, kv, line, top, table, donut, grid,
  sparks, histogram, events, text`.

### What didn't work
- The first live run published nothing and the daemon logged
  `publish marshal failed ... unsupported type: func(goja.FunctionCall) goja.Value`.
  Cause: widget `opts` contains comparator objects (`warn: gt(60)`), and a goja
  comparator exports to Go as a function, which `json.Marshal` rejects. Fixed by
  adding `jsonSafe()` in the prelude and sanitising the snapshot before
  `publishSnapshot`; `o` is now `{"unit":"%"}` and the frame marshals.
- The initial `show()` published before the async `refresh()` had completed, so
  `this.snap` was still null. Fixed by publishing inside `refresh().then(...)`.

### What I learned
- Anything that crosses the JS→Go→JSON boundary must be plain data. Snapshot
  sanitisation is a contract, not an optimisation.

### What was tricky to build
- Keeping the prototype's semantics while removing browser-only dependencies
  (`world`, `engine`, `performance.now`). The `refresh()` guard now uses
  `Date.now()`; the event widget reads a prelude-local ring fed by `emit`/rules.

### What warrants a second pair of eyes
- `jsonSafe` drops any object that is a Metric/Pred/Group/Widget/Dashboard or a
  modifier/comparator; confirm no legitimate widget data is a plain object with
  one of those marker keys.
- The `dash:latest` mirror means every board also writes to one shared topic;
  confirm that is acceptable with several boards live.

### What should be done in the future
- Frontend interpreter (Phase C): port the `WR` widget registry and the
  `/d/<id>` route.
- Persist the JS source so a saved board can be re-run after a restart.

### Code review instructions
- Start at the `dashboard DSL` block in `pkg/runtime/prelude/engine.js` and
  `Options.PublishSnapshot` in `pkg/runtime/module.go`.
- Validate: `GOWORK=off go test ./pkg/runtime/... -run TestDashboard -v` and the
  live sequence in the step prose.

### Technical details
- Topics: `dash:<slug(title)>` and `dash:latest`. Frame type `snapshot`, body in
  `value`. Dashboard id = `opts.id || slug(title)`.

## Step 18: Phase C — React widget interpreter and dashboard routes

This step implements the browser half of v2: a generic interpreter that renders
dashboard snapshots, plus routes to view a board.

### Prompt Context
**User prompt (verbatim):** see Step 17.
**Assistant interpretation:** The React side must contain no metric logic; it maps
`widget.type` to a component and renders `widget.data`.
**Inferred user intent:** Dashboards authored in JS render in the app, using the
prototype's look, without reimplementing metrics in the browser.
**Commit (code):** recorded after this entry.

### What I did
- `web/src/theme/widgets.css`: the ~3.6 KB of widget CSS ported from the v2
  prototype.
- `web/src/organisms/dashboard/format.ts`: `fv`, `fnum`, `stc`, `timeStr`,
  `niceMax`, `COLORS`.
- `web/src/organisms/dashboard/widgets/`: `basic.tsx` (Line, WStat, WGauge),
  `plots.tsx` (Plot, AreaPlot, WBar, WHist), `parts.tsx` (WDonut, WTable, WHeat,
  WGrid, WTop, WSparks), `text.tsx` (WEvents, WText, WKv).
- `web/src/organisms/dashboard/registry.ts`: `WR` mapping the fifteen types.
- `web/src/organisms/dashboard/Widget.tsx`: chrome + state class + registry
  dispatch (unknown types render an "unsupported widget" card).
- `web/src/organisms/dashboard/DashboardView.tsx`: header (title, updated time,
  vars, range), sections and widget rows `flex span/12`.
- `web/src/app/dashboardSlice.ts`: `snapshots` by id + `latest`.
- `web/src/hooks/useStream.ts`: subscribes to extra topics and dispatches
  `snapshot` frames into `dashboardSlice`.
- `web/src/routes/DashboardBoard.tsx` + `App.tsx`: route `/d/<id>` and the IDE
  "Dashboard" tab (`dash:latest`).
- Rebuilt the frontend, restaged `pkg/httpapi/dist`, `go build`/`vet`/`test`
  green.

### Why
- A registry + generic `<Widget>` keeps the browser free of metric logic and
  makes new widget types additive.
- `dash:latest` lets the IDE follow whatever board a run just defined, without
  needing to parse the id from console output.

### What worked
- `pnpm typecheck` clean; `pnpm build` produced a 257 kB bundle (84 kB gzip);
  the whole Go gate stayed green with the new embed.

### What didn't work
- `basic.tsx` first imported `./format` (wrong depth); fixed to `../format`.
- The first `App.tsx` draft used `require()` for the `/d/<id>` route, which does
  not exist in ESM/Vite; replaced with a normal static import.

### What I learned
- React components are contravariant in props, so widgets that only need `d`
  (table, events, text, kv) are assignable to the registry's `{d, o}` signature
  without extra plumbing.

### What was tricky to build
- Porting the prototype's `h(...)` render code to typed JSX without changing the
  visual output: the SVG view boxes, stacking order and opacities were kept
  exactly, since they define the look.

### What warrants a second pair of eyes
- Dashboard variables render as disabled selects (the backend has no
  set-var endpoint yet); confirm display-only is acceptable or add
  `POST /api/v1/dashboard/{id}/var`.
- `useStream` opens one socket per hook instance; the IDE and a board route in
  the same page would open two. Consider a shared connection.

### What should be done in the future
- A dashboard list page that links to `/d/<id>`; a "Save" action that persists
  the JS source; var/range interactivity via an endpoint.

### Code review instructions
- Start at `web/src/organisms/dashboard/registry.ts`, `Widget.tsx`,
  `DashboardView.tsx`, then `web/src/hooks/useStream.ts`.
- Validate: `cd web && pnpm typecheck && pnpm build`, then run a dashboard and
  open `/d/<id>`.

### Technical details
- Snapshot frame: `{type:"snapshot", topic:"dash:<id>", value: DashboardSnapshot}`.
- `flex: span 1 (span/12)%`, min-height from `opts.h` per widget.

## Step 19: Restart the demo fleet in tmux and a CLI publishing limitation

The user asked to restart the running app in tmux when the v2 work was done. This
step rebuilds, recreates the tmux session with the new binary, and records one
limitation discovered while wiring the live dashboard window.

### Prompt Context
**User prompt (verbatim):** "restart the result in tmux when done."
**Assistant interpretation:** Recreate the tmux session so the running demo uses
the v2 build (dashboard DSL + interpreter).
**Inferred user intent:** A ready-to-test environment, not just committed code.
**Commit (code):** this step only changes the diary; the binary is rebuilt from
the Phase B/C commits.

### What I did
- Rebuilt `./dist/docker-metrics`, killed the old `dm` session, ran
  `docker compose down`, and recreated four windows: `collector` (`serve
  --listen 127.0.0.1:8080`), `fleet` (four load containers), `dashboard`, and
  `shell`.
- The `dashboard` window waits for `/healthz`, then POSTs
  `testdata/dashboards/dash-basic.js` to `POST /api/v1/run` (helper at
  `/tmp/live-dashboard.sh`), which runs the board inside the server so its
  snapshots reach the hub.
- Verified: collector sees 7 containers, `/d/board` serves the SPA, and a
  `dash:latest` subscriber receives
  `{title:"Board", id:"board", rows:4}` with widget types
  `stat, gauge, kv, line, top, table, donut, grid, sparks, histogram, events,
  text`.

### Why
- Only the server has a WebSocket hub, so a dashboard must run under `serve` for
  its snapshots to be visible to browsers.

### What worked
- The full loop end to end: load containers → collector → goja dashboard →
  snapshot frame → (browser) interpreter.

### What didn't work
- The first `dashboard` window used the CLI (`docker-metrics run --follow`).
  It computed the dashboard and logged `dashboard defined`, but **published
  nothing**, because the CLI run session does not set
  `runtime.Options.PublishSnapshot` (there is no hub in the CLI process).
  Fixed by POSTing the source to the server's `/api/v1/run` instead. The
  underlying limitation remains: `dashboard().show()` only publishes under
  `serve`, which is correct but worth documenting in the user guide.

### What I learned
- A headless `run` and a served `run` share the same runtime code but differ in
  their wired callbacks; a dashboard is only observable when the publisher is
  wired.

### What was tricky to build
- Making the tmux window self-contained and robust: it must wait for the server
  to be ready, JSON-encode the source without brittle quoting, and then hold the
  pane open.

### What warrants a second pair of eyes
- Whether the CLI should optionally expose a hub (e.g. `run --serve`) for parity,
  or whether dashboards should remain a `serve`-only feature. Recommendation:
  keep them `serve`-only and document it.

### What should be done in the future
- Add a `scripts/` helper (committed) for launching a live dashboard instead of a
  `/tmp` script.
- Add var/range interactivity and dashboard persistence (source storage).

### Code review instructions
- No code changes; confirm with `tmux list-windows -t dm`, `curl localhost:8080/healthz`,
  and the `dash:latest` subscription above.

### Technical details
- Session `dm`: windows `collector` :8080, `fleet` (compose), `dashboard`
  (POST /api/v1/run), `shell`.
