---
Title: Dashboard DSL and Widget Interpreter (v2)
Ticket: DOCKERMETRICS-001
Status: active
Topics:
    - backend
    - websocket
    - metrics
    - frontend
    - react
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: pkg/hub/hub.go
      Note: |-
        Carries dashboard snapshots to the browser
        Carries snapshots on dash topic
    - Path: pkg/runtime/prelude/engine.js
      Note: |-
        Where the dashboard DSL and widget computation will be ported on the backend
        Backend port target for the dashboard DSL and widgets
    - Path: repo://pkg/runtime/module.go
      Note: Adds the publishSnapshot native export
    - Path: repo://ttmp/2026/10/06/DOCKERMETRICS-001--docker-metrics-daemon-and-react-ide-analysis-design-and-implementation-guide/sources/local/dockermetrics-ide-v2.html
      Note: v2 prototype specification
    - Path: repo://web/src/hooks/useStream.ts
      Note: WebSocket subscription for dashboard topics
    - Path: web/src/organisms/widgets
      Note: Where the widget interpreter (WR registry) will live
ExternalSources:
    - local:dockermetrics-ide-v2.html
Summary: Intern-facing design and implementation guide for the v2 dashboard DSL (dashboard()/widgets) and the JSON widget interpreter that renders dashboards on the React side.
LastUpdated: 2026-10-06T19:30:00-04:00
WhatFor: 'Explain and implement user-authored dashboards: the JS builder API, the snapshot JSON contract, the backend port into go-go-goja, and the React widget interpreter.'
WhenToUse: Read before implementing or changing any dashboard, widget or dashboard-rendering code.
---

# Dashboard DSL and Widget Interpreter (v2)

> Audience: a new engineer who has read `01-analysis-design-and-implementation-guide-for-interns.md`.
> That document explains the metric DSL (`cpu`, `avg`, `read`, `stream`, rules,
> the go-go-goja runtime and the React shell). This document explains the layer
> on top of it: **user-authored dashboards**.
>
> By the end you should be able to explain the two halves — the **JS builder**
> that produces a dashboard and the **JSON interpreter** that draws it — and
> implement both against the real backend.

---

## 0. How to read this document

1. Read **§1 Executive Summary** and **§2 The Problem** for the "why".
2. Read **§3 The v2 Prototype Is The Specification** and open
   `sources/local/dockermetrics-ide-v2.html` next to it.
3. Read **§4 System Overview** and **§5 Vocabulary**; draw the diagram yourself.
4. Read **§6 The Dashboard DSL** and **§7 The Widget Interpreter**; these two are
   the heart of the feature.
5. Read **§8 Backend Port**, **§9 Frontend Port**, **§10 Wire Contract**; these
   are the concrete files.
6. Execute **§12 Implementation Plan** phase by phase.

Companion documents:

| Document | What it is |
| --- | --- |
| `design-doc/01-analysis-design-and-implementation-guide-for-interns.md` | The base system: collector, metric DSL, go-go-goja runtime, WebSocket hub, HTTP API, React shell. |
| `reference/01-system-reference-http-websocket-prometheus-and-dashboard-dsl.md` | Frozen wire contracts and the metric DSL grammar. |
| `sources/local/dockermetrics-ide-v2.html` | The v2 prototype that defines the dashboard DSL and the widget interpreter. |
| `log/01-implementation-diary.md` | Chronological record. |

---

## 1. Executive Summary

The base system lets an operator *query* metrics and *stream* them. v2 adds the
missing product layer: **composable dashboards written in JavaScript**.

A dashboard is a JavaScript program that builds a tree of **widgets**:

```js
dashboard("API at a glance", { every: "3s", range: "10m" })
  .row(
    stat("CPU", api, cpu.pipe(pct, avg), { unit: "%", warn: gt(60), crit: gt(85) }),
    stat("Memory", api, mem.pipe(of("limit"), pct, avg), { unit: "%", warn: gt(70), crit: gt(90) }),
    gauge("Busiest replica", api, cpu.pipe(pct, max), { unit: "%" })
  )
  .row(
    line("CPU by replica", api, cpu.pipe(pct), { unit: "%", span: 8 }),
    top("Memory", api, mem.pipe(mb), { unit: "MB", span: 4 })
  )
  .show();
```

The crucial design idea — and the thing the user explicitly liked — is that the
**dashboard is compiled to plain JSON on the server, and the React app is a
generic interpreter of that JSON.** The JS side does *all* the metric math and
returns, per widget, a small data object shaped for its type (a number + a
sparkline for `stat`, a list of series for `line`, a matrix for `heatmap`, …). The
React side contains **no metric logic at all**: it maps `widget.type` to a
component and renders `widget.data`.

```text
   JavaScript (authoring)                    JSON (transport)               React (rendering)
 ┌───────────────────────────┐        ┌──────────────────────────┐     ┌───────────────────────┐
 │ dashboard(title, opts)    │        │ { title, t, vars, range, │     │ WR = { stat: WStat,   │
 │   .row(stat(...), ...)    │  ───▶  │   rows: [ { section }    │ ──▶ │        line: Plot,    │
 │   .show()                 │        │         | { widgets:[{    │     │        table: WTable, │
 │ Widget.compute(ctx)       │        │       id,type,title,o,   │     │        ... } ]        │
 │   → data per type         │        │       span,data,error }] │     │ <Widget w={w}/>       │
 └───────────────────────────┘        │   ] }                    │     └───────────────────────┘
                                      └──────────────────────────┘
```

Why this split is good:

- **One place for metric logic.** All ranges, buckets, reducers and state
  thresholds are computed once, on the server, in the language the user already
  writes. The React code stays dumb and stable.
- **A stable contract.** Adding a widget type is additive: a compute branch on
  the JS side and one component on the React side, plus one registry entry.
- **Testable.** The snapshot is plain JSON, so widget computation can be unit
  tested without a browser, and the interpreter can be tested with fixture
  snapshots without a backend.

v2 ships fifteen widget types: `stat, gauge, line, area, bar, donut, table,
heatmap, grid, top, histogram, sparks, events, text, kv`, plus layout primitives
`section()` and `row()`, dashboard `var()`s and a `range()` selector.

---

## 2. The Problem

The base system answers "what is this metric now?" and "stream it". It does not
answer "give me a *view*": several related numbers, a chart, a breakdown and a
table, arranged, updating together, with warn/crit colouring. Today that view is
hard-coded in the React app (the Fleet, Charts, Events and Sinks tabs). An
operator cannot compose a new one without a frontend change.

Three requirements drive the design:

1. **Authorable without a recompile.** A dashboard must be creatable by writing
   JavaScript in the IDE, exactly like a metric expression.
2. **Reusable primitives.** The same building blocks (`cpu.pipe(pct)`, `by()`,
   `avg`) must feed a stat card, a line chart, a table column and a heatmap row
   without re-implementation.
3. **A thin renderer.** The browser must not embed a metrics engine. It should
   receive a description of what to draw and draw it.

### Non-goals

- Dragging/resizing dashboards with the mouse (the layout is `span`-based, fixed).
- Arbitrary HTML/JSX in dashboards (only the widget vocabulary).
- Server-side rendering of dashboards to images.
- Persisting dashboards with their live streams across a restart (see §16).

---

## 3. The v2 Prototype Is The Specification

Open `sources/local/dockermetrics-ide-v2.html` (imported from
`~/Downloads/dockermetrics-ide (2).html`, ~1200 lines). It is the v2 of the
browser-only prototype. Relative to v1 it adds:

- A **dashboard DSL** in the engine (`dashboard()`, `Widget`, fifteen factories,
  `section`, `row`, `var`, `range`, `every`, `show`).
- A **snapshot compiler** (`Dashboard.refresh()` builds `world.board.dash.snap`).
- A **widget interpreter** in the React part (`WR = { stat: WStat, … }` and a
  generic `<Widget>` component).
- Eight new **presets** in the "Dashboards" group (`dash-basic`, `dash-zoo`,
  `dash-ops`, `dash-fleet`, `dash-slo`, `dash-compose`, `dash-incident`).
- ~3.6 KB of new CSS for the widget chrome and canvas elements.

The prototype runs against the in-browser simulation (`world.sims`). Our job is
to keep the DSL and the snapshot contract **byte-for-byte in behaviour** and move
the data source to the real store — exactly as v1 was ported.

### 3.1 Prototype engine additions (map)

```text
engine (v2 additions)
├── maxOf, minOf                  combine ops: max/min of two metrics
├── rawOf                         Report -> .data
├── leaves(d, p)                  flatten nested series into [{name, pts}]
├── flatVals(d, p)                flatten nested numbers into [[name, value]]
├── avgPts(leaves)                average several series pointwise (sparkline)
├── stateOf(v, opts)              ok | warn | crit from {warn, crit} comparators
├── isOpts(x)                     is this arg an options object (vs a mod)?
├── DEFSPAN                       default column span per widget type (12-col grid)
├── wmods(w, ctx, n, noBy)        auto last(range) + bucket(range/n)
├── entriesOf(group, metric, w)   group.read + flatten -> [[name, value]]
├── scalarOf(group, metric, w)    group.read -> one number
├── asSpecs(spec)                 Metric -> {name: Metric}
├── class Widget                  .compute(ctx) -> per-type data object
├── stat/gauge/line/area/bar/...  widget factories (wfac)
├── events/text/kv                non-metric widgets
└── class Dashboard               .var/.range/.every/.section/.row/.refresh/.show/.snapshot
```

### 3.2 Prototype React additions

```text
React (v2 additions)
├── fv(v, o)                      format a value with unit/dec
├── stc(state)                    state -> CSS colour
├── Line({pts,...})               inline sparkline/area
├── WStat, WGauge, Plot, WBar, WDonut, WTable, WHeat, WGrid, WTop, WHist,
│   WSparks, WEvents, WText, WKv  one component per widget type
├── WR                            { type -> component } registry
├── Widget({w})                   chrome + dispatch to WR[w.type]
└── Dashboard()                   renders snap.rows / sections / vars / range
```

---

## 4. System Overview

```text
                     ┌─────────────────────────────────────────────────────────┐
                     │                 docker-metrics (Go)                     │
   Docker ──▶ collector ──▶ store ──┐                                        │
                                    │                                        │
                     ┌──────────────▼───────────────┐                        │
                     │  go-go-goja runtime          │                        │
                     │   prelude/engine.js          │                        │
                     │    • metric DSL (v1)         │                        │
                     │    • dashboard DSL + widgets │  (v2 — this doc)       │
                     │   dashboard.show()           │                        │
                     │    → compute snapshot JSON   │                        │
                     │    → core.publishSnapshot()  │                        │
                     └──────────────┬───────────────┘                        │
                                    │ snapshot JSON                          │
                     ┌──────────────▼───────────────┐                        │
                     │  hub: topic "dash:<id>"       │                        │
                     │  (also "dash:latest")         │                        │
                     └──────────────┬───────────────┘                        │
                     ┌──────────────▼───────────────┐                        │
                     │  embedded React app          │                        │
                     │   <DashboardView snapshot>   │                        │
                     │   WR interpreter → widgets   │                        │
                     └──────────────────────────────┘                        │
                     └─────────────────────────────────────────────────────────┘
```

The only new wire element is the **dashboard snapshot frame** on topic
`dash:<id>` (and a mirror on `dash:latest` so the IDE can follow the most recent
dashboard without knowing its id).

---

## 5. Vocabulary

| Term | Meaning |
| --- | --- |
| **Dashboard** | A `Dashboard` builder: a title, options, sections/rows of widgets, variables and a range. |
| **Widget** | One card: a `type` (`stat`, `line`, …), a `title`, a `group`, a `metric spec`, modifiers (`by/last/bucket`) and `opts`. |
| **Group** | The existing selector (`docker().containers(...)`); may be a *function of dashboard variables*. |
| **Spec** | A `Metric`, or an object of named metrics (`{cpu, mem}`) for multi-series widgets. |
| **Modifiers** | `by()`, `last()`, `since()`, `bucket()`, `{window}` — same objects as the metric DSL. |
| **Options (`opts`)** | Presentation/thresholds: `unit, span, warn, crit, min, max, dec, sort, asc, limit, n, bins, stack, legend, columns, types, desc, h`. |
| **Span** | Column width in a 12-column grid; defaults from `DEFSPAN[type]`. |
| **State** | `ok | warn | crit`, computed from `stateOf(value, {warn, crit})`. |
| **Snapshot** | The JSON the dashboard compiles to; `{title, t, vars, range, rangeOptions, rows}`. |
| **Row** | `{widgets: [...]}` or `{section: "…"}`. |
| **Widget frame** | One entry in a row: `{id, type, title, o, span, data, error}`. |
| **Compute** | `Widget.compute(ctx)` — runs the metric math for one widget and returns its `data`. |
| **Interpreter** | The React `WR` registry + `<Widget>` that dispatches on `type` and renders `data`. |
| **Variable** | `var(name, options, def)` — a dropdown whose value is available to group functions and `kv`/`text` callbacks. |

---

## 6. The Dashboard DSL

### 6.1 The builder

```js
const board = dashboard(title, { every: "5s", range: "15m", id? })
  .var("env", ["prod", "dev"], "prod")     // dropdown; value available as ctx.vars.env
  .var("service", ["all", "api", "worker"])
  .range("15m", ["5m", "15m", "30m"])      // time window + selectable options
  .every("5s")                             // refresh cadence
  .section("Numbers")                      // a full-width heading
  .row(stat(...), stat(...), gauge(...))   // a 12-column row of widgets
  .section("Time series")
  .row(line(...), area(...))
  .show();                                 // start refreshing and publishing
```

Builder methods:

| Method | Effect |
| --- | --- |
| `dashboard(title, opts)` | Create the builder. `opts.every` (default `5s`), `opts.range` (default `15m`), `opts.id`. |
| `.var(name, options, def)` | Add a variable; default is `options[0]`. |
| `.range(d, options?)` | Set the window; `options` become the header selector. |
| `.every(d)` | Refresh cadence. |
| `.section(title)` | Push a section heading item. |
| `.row(...widgets)` | Push a row; nested arrays are flattened. Non-widgets throw. |
| `.setVar(n, v)` | Set a variable and force a refresh (used by the header dropdown). |
| `.setRange(s)` | Set the range and force a refresh. |
| `.refresh(force?)` | Recompute every widget into `snap`. |
| `.show()` | Register a ticker that calls `refresh()` and publishes; returns the builder. |
| `.stop()` | Stop refreshing. |
| `.snapshot()` | The last computed snapshot. |

### 6.2 Widget factories

All metric widgets share the signature:

```js
widget(title, group, spec, ...modsAndOpts)
```

where `...modsAndOpts` is split at call time: objects that are modifiers
(`by()`, `last()`, `bucket()`, `{window}`) become **mods**; a plain object is the
**opts** (`isOpts`). Examples:

```js
stat("CPU", api, cpu.pipe(pct, avg), { unit: "%", warn: gt(60), crit: gt(85) })
line("CPU by service", all, cpu.pipe(pct, avg), by("label:service"), { unit: "%" })
area("Memory by service", all, mem.pipe(mb, sum), by("label:service"), { unit: "MB", stack: true })
table("Containers", be, { cpu: cpu.pipe(pct), mem: mem.pct() }, { sort: "cpu", columns: { cpu: { bar: true, max: 100 } } })
```

| Factory | Purpose | Default span |
| --- | --- | --- |
| `stat(title, g, m, opts)` | Big number + delta + sparkline | 3 |
| `gauge(title, g, m, opts)` | Semicircle gauge with min/max | 3 |
| `line` / `area` | Multi-series time plot (area can stack) | 6 |
| `bar(title, g, m, mods, opts)` | Grouped bars over categories | 6 |
| `donut(title, g, m, mods, opts)` | Share of a total, top 7 + "other" | 4 |
| `table(title, g, spec, mods, opts)` | Rows with per-column bars/format | 8 |
| `heatmap(title, g, m, opts)` | Rows × time buckets intensity | 8 |
| `grid(title, g, m, opts)` | Tiles, one per container, state-coloured | 6 |
| `top(title, g, m, opts)` | Ranked bars (top N) | 4 |
| `histogram(title, g, m, opts)` | Distribution + p50/p95 | 4 |
| `sparks(title, g, m, opts)` | One sparkline per container | 6 |
| `events(title, opts)` | Recent events (`types` filter, `limit`) | 6 |
| `text(title, body\|fn, opts)` | Tiny markdown-ish text | 4 |
| `kv(title, fn, opts)` | Key/value pairs from a callback | 4 |

### 6.3 Options

```text
unit      string   appended to values ("%", "MB", "KB/s")
span      number   1..12 grid columns (default DEFSPAN[type])
warn,crit compiler thresholds (gt(60), lt(0.1), ...)  -> state
min,max   number   gauge/histogram/heatmap/plot bounds
dec       number   decimal places
sort,asc  string/bool  table/bar ordering
limit,n   number   how many rows/items
bins      number   histogram bins
stack     bool     stacked area
legend    bool     show/hide plot legend
columns   map      per-column table opts {unit, bar, max, dec, warn, crit}
types     string[] events filter
desc      string   subtitle under the widget title
h         number   min height (px)
```

### 6.4 Compute, step by step (pseudocode)

```text
Widget.compute(ctx):
    g    = (typeof group === "function") ? group(ctx.vars) : group   # group may depend on vars
    spec = this.spec
    switch type:
        "stat":
            v    = scalarOf(g, spec)                 # one number (avg across group)
            ser  = avgPts(leaves(history(spec, last(range))))   # sparkline
            d    = series[0] ? pct change over range : null
            return {value, state: stateOf(v, opts), series, delta}
        "gauge":  return {value, min, max, state}
        "line"/"area":
            series = for each named metric: leaves(history(metric, last(range), bucket(range/60)))
            return {series, t0: now-range, t1: now}
        "bar":    labels ∪ group.read(metric, by); series = {name, values}
        "donut":  entries = flatten(group.read(metric, by)); top 7 + "other"
        "table":  columns from spec; rows from flatten(read); per-col state + max
        "heatmap": rows × time buckets matrix from history
        "grid":   tiles = flatten(read) with state
        "top":    items = sort(flatten(read))[:n]
        "histogram": bins over history values + p50/p95
        "sparks": one series per container from history
        "events": last N events (optionally filtered by type)
        "text":   body (string or fn(ctx))
        "kv":     Object.entries(fn(ctx))
```

Two helper rules matter:

- **`wmods` adds defaults.** Every history-based widget gets `last(ctx.range)`
  automatically and, if it asks for `n`, `bucket(range/n)`. User modifiers are
  preserved.
- **`entriesOf` picks the right grouping.** If the metric has a reducer and no
  explicit `by()`, it groups by `by("name")`; otherwise it uses the user's
  `by()`. This is what makes `bar`/`donut`/`table`/`top` work with a single
  scalar metric per container.

### 6.5 State colouring

```js
stateOf(v, { warn, crit }) =
    v == null || no thresholds      -> "ok"
    crit.fn(v)                      -> "crit"
    warn.fn(v)                      -> "warn"
    else                            -> "ok"
```

`warn`/`crit` are the same comparators used by predicates (`gt(60)`, `lt(0.1)`).
The state drives border colours, number colours, bar colours and table cell
colours — all on the **React** side, from the `state` field.

---

## 7. The Widget Interpreter

The interpreter is the payoff of the design: a small, generic React module that
turns a snapshot into UI.

### 7.1 The snapshot contract

```json
{
  "title": "API at a glance",
  "t": 1770000000,
  "vars": [ { "name": "env", "options": ["prod","dev"], "value": "prod" } ],
  "range": 600,
  "rangeOptions": [300, 600, 900],
  "rows": [
    { "section": "Numbers" },
    { "widgets": [
        { "id": 0, "type": "stat", "title": "CPU", "span": 3, "o": { "unit": "%" },
          "data": { "value": 42.1, "state": "ok", "series": [38,40,41,42.1], "delta": 3.2 },
          "error": null },
        { "id": 1, "type": "line", "title": "CPU by replica", "span": 8, "o": { "unit": "%" },
          "data": { "series": [ { "name": "api-1", "pts": [ {"t":1,"v":0.4} ] } ],
                    "t0": 1769999400, "t1": 1770000000 } }
    ] }
  ]
}
```

Per-widget `data` shapes (this is the interpreter's whole vocabulary):

| type | data |
| --- | --- |
| `stat` | `{value, state, series: number[], delta}` |
| `gauge` | `{value, min, max, state}` |
| `line`, `area` | `{series: [{name, pts: [{t,v}]}], t0, t1}` |
| `bar` | `{labels: string[], series: [{name, values: (number\|null)[]}]}` |
| `donut` | `{slices: [{label, value}], total}` |
| `table` | `{cols, rows: [{name, cells, st}], colMax, colOpts}` |
| `heatmap` | `{rows: string[], times: number[], cells: (number\|null)[][], min, max}` |
| `grid` | `{tiles: [{name, value, state}]}` |
| `top` | `{items: [{name, value, state}], max}` |
| `histogram` | `{bins: [{lo, hi, n}], total, p50, p95}` |
| `sparks` | `{rows: [{name, pts, value, state}]}` |
| `events` | `{items: [{t, type, msg}]}` |
| `text` | `{body: string}` |
| `kv` | `{pairs: [[key, value]]}` |

### 7.2 The registry

```tsx
const WR: Record<string, React.FC<{d: any; o: any}>> = {
  stat: WStat, gauge: WGauge, line: Plot, area: AreaPlot, bar: WBar, donut: WDonut,
  table: WTable, heatmap: WHeat, grid: WGrid, top: WTop, histogram: WHist,
  sparks: WSparks, events: WEvents, text: WText, kv: WKv,
};

function Widget({ w }: { w: WidgetFrame }) {
  const R = WR[w.type];
  return (
    <article className={"w w-" + w.type + stateClass(w.data)}
             style={{ flex: `${w.span} 1 ${(w.span / 12) * 100}%` }}>
      <header className="w-h"><b>{w.title}</b>{w.o.desc && <span>{w.o.desc}</span>}</header>
      <div className="w-b">
        {w.error ? <div className="werr">{w.error}</div>
                 : w.data ? <R d={w.data} o={w.o} /> : <div className="empty sm">loading…</div>}
      </div>
    </article>
  );
}
```

Layout: `snap.rows` renders as headings (`section`) or flex rows; each widget's
`flex` basis is `span/12`, giving the 12-column grid.

### 7.3 Rendering helpers

- `fv(value, opts)` formats a number with `dec` decimals and appends `unit`
  (`%` has no space, other units are space-separated).
- `stc(state)` maps `ok|warn|crit` to `var(--ok|--warn|--bad)`.
- `Line`/`Plot`/`WBar`/`WHeat` are dependency-free SVG renderers (no chart
  library), consistent with the rest of the app.
- `WText` implements a tiny markdown subset (`# `, `- `, `**bold**`, `*em*`).

### 7.4 Why an interpreter and not generated JSX

- The backend is JavaScript, not a UI framework; it cannot produce components.
- A data-only snapshot is stable, cheap to send over a WebSocket, easy to log,
  and safe (no code crosses the wire).
- New widget types are additive and backward-compatible (unknown types can render
  an "unsupported widget" card instead of crashing).

---

## 8. Backend Port

The dashboard DSL is pure JavaScript. Because we already ported the metric
engine (v1) into `pkg/runtime/prelude/engine.js`, the dashboard layer is a
near-mechanical port: the prototype's `Widget.compute` already calls
`group.read` / `group.history`, which our prelude implements against the real
store.

### 8.1 What to port

Add to `pkg/runtime/prelude/engine.js`:

- `maxOf`, `minOf` combine ops.
- `rawOf`, `leaves`, `flatVals`, `avgPts`, `stateOf`, `isOpts`, `DEFSPAN`,
  `wmods`, `entriesOf`, `scalarOf`, `asSpecs`.
- `class Widget` with the fifteen `compute` branches.
- The widget factories (`stat`, `gauge`, `line`, `area`, `bar`, `donut`, `table`,
  `heatmap`, `grid`, `top`, `histogram`, `sparks`) plus `events`, `text`, `kv`.
- `class Dashboard` (`var`, `range`, `every`, `section`, `row`, `setVar`,
  `setRange`, `refresh`, `show`, `stop`, `snapshot`) and `dashboard(title, opts)`.
- Add all of these to the exported `api` object so they are globals.

### 8.2 What to change versus the prototype

| Prototype | Backend port |
| --- | --- |
| `world.t` | `now()` (module `core.now()`). |
| `world.events` | a prelude-local event ring, appended by `emit`/watcher/rule paths. |
| `dashboard().show()` sets `world.board` | `show()` starts a Go-driven ticker (the prelude item registry, `__tick`) that calls `refresh()` and `core.publishSnapshot(id, snap)`. |
| `engine.add({tick})` | the existing prelude `addItem({label, tick, stop})` used by streams/watchers. |
| `chaos.*` | absent in production (test-only prelude). |
| dashboard id | `opts.id || slug(title)` so re-running is idempotent. |

### 8.3 Publishing the snapshot

The snapshot is JSON. Cross the boundary through a new native-module export:

```go
// pkg/runtime/module.go (new export)
exports.Set("publishSnapshot", func(id string, snap goja.Value) {
    if state.opts.PublishSnapshot != nil {
        state.opts.PublishSnapshot(id, exportMap(snap))
    }
})
```

```go
// pkg/runtime/manager.go
type Options struct {
    // ...
    // PublishSnapshot forwards a computed dashboard snapshot.
    PublishSnapshot func(id string, snapshot map[string]any)
}
```

```js
// prelude: dashboard.show()
this.item = addItem({
  label: "dashboard " + this.title,
  tick: () => {
    if (now() - this.lastT < this.ev) return;
    this.refresh();
    if (this.snap) core.publishSnapshot(this.id, this.snap);
  },
  stop: () => { removeItem(this.item); this.item = null; },
});
this.refresh();
if (this.snap) core.publishSnapshot(this.id, this.snap);
```

### 8.4 Server wiring

```go
// pkg/httpapi: wire Options.PublishSnapshot when creating run/default sessions
PublishSnapshot: func(id string, snap map[string]any) {
    s.cfg.Hub.Publish("dash:"+id, hub.Frame{Type: "snapshot", Value: snap})
    s.cfg.Hub.Publish("dash:latest", hub.Frame{Type: "snapshot", Value: snap})
},
```

The hub already supports arbitrary topics, backpressure and recent-frame replay,
so a browser that subscribes a moment late still receives the last snapshot.

### 8.5 Sketch of the prelude addition (shape only)

```js
const DEFSPAN = { stat:3, gauge:3, line:6, area:6, bar:6, donut:4, table:8,
  heatmap:8, grid:6, top:4, histogram:4, sparks:6, events:6, text:4, kv:4 };

class Widget {
  constructor(type, title, group, spec, mods, opts) { /* ... */ }
  compute(ctx) { /* switch(type) -> data, as in §6.4 */ }
}
const wfac = (type) => (title, group, spec, ...rest) =>
  new Widget(type, title, group, spec,
             rest.filter((x) => !isOpts(x)),
             Object.assign({}, ...rest.filter(isOpts)));

class Dashboard {
  constructor(title, o) { /* vars, range, rows, id */ }
  row(...ws) { /* validate widgets, push {widgets} */ }
  refresh(force) { /* build snap */ }
  show() { /* addItem ticker -> refresh + publishSnapshot */ }
}
const dashboard = (title, o) => new Dashboard(title, o);
```

---

## 9. Frontend Port

### 9.1 New frontend files

```text
web/src/
    app/dashboardSlice.ts          stores the latest snapshot per dashboard id
    app/api.ts                     (+ getDashboard for /d/<id> metadata; unchanged otherwise)
    hooks/useDashboardStream.ts    subscribes to dash:<id> (or dash:latest) over WS
    organisms/dashboard/
        DashboardView.tsx          renders snap.rows (sections, rows, vars, range)
        Widget.tsx                 chrome + WR dispatch
        format.ts                  fv(), stc(), colors
        widgets/
            WStat.tsx  WGauge.tsx  Plot.tsx  WBar.tsx  WDonut.tsx  WTable.tsx
            WHeat.tsx  WGrid.tsx  WTop.tsx  WHist.tsx  WSparks.tsx
            WEvents.tsx  WText.tsx  WKv.tsx
            registry.ts            WR mapping type -> component
    routes/Dashboard2.tsx          route /d/:id  (and IDE "Dashboard" tab)
    theme/widgets.css             the ~3.6 KB of widget CSS from the prototype
```

### 9.2 State

`dashboardSlice`:

```ts
interface DashboardState {
  snapshots: Record<string, DashboardSnapshot>; // by id
  latestId: string | null;
  // ...
}
```

`useDashboardStream(id | null)`:

```ts
useEffect(() => {
  const topic = id ? `dash:${id}` : "dash:latest";
  ws.send(subscribe(topic));
  ws.onmessage = (m) => {
    if (m.type === "snapshot") dispatch(setSnapshot({ id: m.topic.split(":")[1], snapshot: m.value }));
  };
}, [id]);
```

The existing `useStream` hook already owns one reconnecting WebSocket; extend it
to accept extra topics rather than opening a second socket.

### 9.3 Routing

- `/d/<id>` renders `DashboardView` for a saved dashboard.
- The IDE's **Dashboard** tab renders `DashboardView` for `dash:latest`.
- If no snapshot has arrived, show "No dashboard yet. Define one with
  `dashboard("title").row(stat(...), line(...)).show()`".

### 9.4 CSS

Copy the prototype's added rules (`/tmp/v2-widget-css.txt` during implementation,
or the `<style>` block of the v2 source) into `web/src/theme/widgets.css`:
`.dash .dh .dsec .drow`, `.w .w-h .w-b .werr`, `.w-stat .big .delta`,
`.wspark .wgauge .wplot .wleg .wdonut .wtbl .wgrid .wtop .wsp .wev .wtext .wkv`,
plus the small helpers `.tile .trow .tn .tt .tv .srow .sl .cb .dv .gv`.

---

## 10. Wire Contract

Topic: `dash:<id>`, plus mirror `dash:latest`.

```json
{ "type": "snapshot", "topic": "dash:api-demo", "value": { /* DashboardSnapshot */ } }
```

Full snapshot spec in §7.1. Notes:

- The frame carries the whole snapshot (not a diff). Snapshots are small (a few
  KB) and self-contained, so a late subscriber is always correct.
- Publishing is throttled by the dashboard's `every` (default 5s) and by
  `refresh()`'s 300 ms guard.
- `error` is per widget: a widget that throws (e.g. an unknown `by()` key) shows
  its error inline without breaking the board.

---

## 11. File Layout (target)

```text
pkg/runtime/prelude/engine.js          + dashboard DSL, Widget, Dashboard, publishSnapshot call
pkg/runtime/module.go                  + publishSnapshot export, Options.PublishSnapshot
pkg/runtime/manager.go                 + Options.PublishSnapshot field
pkg/httpapi/run.go, server.go          + wire PublishSnapshot -> hub "dash:<id>"/"dash:latest"
testdata/dashboards/dash-basic.js      new fixture presets
web/src/app/dashboardSlice.ts          new
web/src/app/streamSlice.ts             unchanged
web/src/hooks/useStream.ts             + extra topics + snapshot handling
web/src/organisms/dashboard/*          new (DashboardView, Widget, widgets/*)
web/src/routes/Dashboard2.tsx          new (/d/:id)
web/src/theme/widgets.css              new (ported CSS)
pkg/httpapi/dist/*                     rebuilt embed
```

---

## 12. Implementation Plan

### Phase A — Design and reference (this document)
1. Import the v2 prototype (done).
2. Write this guide; upload to reMarkable.

### Phase B — Backend dashboard DSL
1. Port the helper functions and `Widget`/`Dashboard` into the prelude.
2. Add `maxOf`/`minOf`, the prelude event ring, and `slug()`.
3. Add `publishSnapshot` to the module and `Options.PublishSnapshot`.
4. Wire `PublishSnapshot` in `pkg/httpapi` to topics `dash:<id>` / `dash:latest`.
5. Port the "Dashboards" presets to `testdata/dashboards/` and add a runtime test
   that runs `dash-basic` against a fake store and asserts snapshot shapes
   (`rows`, widget `type`, `data.value`, `state`).
6. Validate live: run a dashboard via `/api/v1/run`, capture `/ws` `dash:latest`.

### Phase C — Frontend interpreter
1. Port the widget CSS.
2. Implement `format.ts`, the fifteen widget components, `registry.ts`,
   `Widget.tsx`, `DashboardView.tsx`.
3. Extend `useStream` for extra topics; add `dashboardSlice`.
4. Add the `/d/<id>` route and the IDE Dashboard tab.
5. Rebuild the frontend, stage into `pkg/httpapi/dist`, verify the embedded app.

### Phase D — Polish
1. Handle unknown widget types gracefully.
2. Add an "Open board" link when a run defines a dashboard.
3. Add a snapshot fixture test on the React side.

---

## 13. Testing Strategy

- **Runtime (Go + goja):** run each dashboard preset against a seeded store;
  assert `snapshot().rows` structure, widget `type`, and that `stat.data.value`
  is a number and `state` reflects `warn`/`crit`.
- **Snapshot golden tests:** serialize a snapshot with fixed timestamps and
  compare to a checked-in JSON fixture.
- **Interpreter (React):** render each widget component from a fixture `data`
  object with Vitest and assert the formatted value; a fixture per widget type.
- **End-to-end:** serve a dashboard from the load fleet, subscribe `/ws`,
  assert a `snapshot` frame with `rows` and live `data`.

---

## 14. Security and Performance

- **No code crosses the wire.** Only JSON; the interpreter never `eval`s.
- **Sandbox unchanged.** Widgets run inside the same `dockermetrics`-only runtime;
  they cannot read files or make network calls.
- **Cost.** Each refresh evaluates every widget: `O(widgets × containers × ops)`.
  Defaults (`every` 5s, `bucket(range/n)`) keep it bounded; the 300 ms refresh
  guard prevents storms when variables change.
- **Payload.** Charts cap series (`slice(0,12)`), tables cap rows (`limit`),
  heatmaps cap rows (16) and text bodies are short — all inherited from the
  prototype.

---

## 15. Alternatives Considered

| Option | Why rejected |
| --- | --- |
| Return JSX/HTML from the backend | The backend is not a UI runtime; unsafe and unversionable. |
| A declarative JSON dashboard with no JS | Loses the ability to compute derived values, loop, and build widget sets with functions (the `dash-compose` preset). |
| Server-side raster/SVG rendering | No interactivity; duplicates the renderer. |
| A charting library (Recharts/D3) | Adds weight; the prototype's hand-rolled SVG is small and matches the design. |
| Store only panel metadata (JSON) and no live snapshot | The earlier deferred design; it cannot express computed data or variables without re-running JS anyway. |

---

## 16. Open Questions

1. **Persistence.** Should `dashboard()` persist the JS source so a saved board
   can be re-run after a restart? Proposal: IDE "Save" posts `{id, name, source}`
   and `/d/<id>` can re-run it; `dashboard()` persists only the last snapshot
   metadata.
2. **`events` source.** The prelude event ring vs. the server's event log: keep
   the ring local for now; consider exposing `core.events()` later.
3. **`text`/`kv` callbacks** run on every refresh; document that they should be
   cheap.
4. **Span/height overrides** in `opts` (`span`, `h`) are per-widget only; a
   named reusable layout is out of scope.
5. **Multiple live dashboards.** Currently `world.board` is singular in the
   prototype; the backend publishes per id, so several boards can stream at once
   — confirm the multi-board UI.

---

## 17. References

### 17.1 Prototype files
- `sources/local/dockermetrics-ide-v2.html` — the v2 specification.
  - Engine additions: search for `dashboards DSL`, `class Widget`, `class Dashboard`.
  - Interpreter: search for `dashboard widgets`, `const WR`, `function Widget(`.

### 17.2 Repository files (to change)
- `pkg/runtime/prelude/engine.js` — add the dashboard DSL.
- `pkg/runtime/module.go` — add `publishSnapshot`; `Options.PublishSnapshot`.
- `pkg/runtime/manager.go` — `Options` field.
- `pkg/httpapi/run.go`, `pkg/httpapi/server.go` — hub topics.
- `web/src/hooks/useStream.ts`, `web/src/app/dashboardSlice.ts`.
- `web/src/organisms/dashboard/*`, `web/src/routes/Dashboard2.tsx`.
- `web/src/theme/widgets.css`.

### 17.3 API references
- Metric DSL: `reference/01-system-reference-http-websocket-prometheus-and-dashboard-dsl.md` §4.
- WebSocket frames: same document §2.
- go-go-goja native module adapters: `pkg/runtime/module.go` and the
  `go-go-goja-module-authoring` skill.

---

## Appendix A — Widget reference (compute → render)

| Type | Compute reads | Render |
| --- | --- | --- |
| `stat` | `scalarOf` + `history` sparkline + delta | big number, delta arrow, sparkline |
| `gauge` | `scalarOf`, min/max | SVG semicircle arc, coloured by state |
| `line` | `history` per metric | SVG polylines, legend, hover |
| `area` | as `line`; `stack` sums series | filled polygons, optionally stacked |
| `bar` | `entriesOf` per metric | grouped SVG bars with labels |
| `donut` | `entriesOf` sorted, top 7 + other | SVG ring + legend list |
| `table` | `entriesOf` per column | table with per-cell bar and colour |
| `heatmap` | `history` matrix | grid of rects by intensity |
| `grid` | `entriesOf` | tiles coloured by state |
| `top` | `entriesOf` sorted, sliced | ranked rows with bars |
| `histogram` | history values binned | bars + p50/p95 footer |
| `sparks` | `history` per container | one inline sparkline per row |
| `events` | prelude event ring | event list (`time/tag/msg`) |
| `text` | string or `fn(ctx)` | mini-markdown block |
| `kv` | `fn(ctx)` object | definition list |

## Appendix B — Preset coverage

| Preset | Widgets exercised |
| --- | --- |
| `dash-basic` | stat, gauge, line, top |
| `dash-zoo` | all fifteen |
| `dash-ops` | var(), range(), function groups, table by host, heatmap |
| `dash-fleet` | grid, bar by host, histogram, top, heatmap, sparks |
| `dash-slo` | gauge with custom `maxOf` metric, kv with async callback, text |
| `dash-compose` | widgets built in a loop from a factory function |
| `dash-incident` | dashboard + rules + events on one board |
