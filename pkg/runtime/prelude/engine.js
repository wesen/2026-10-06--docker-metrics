// engine.js — the docker-metrics dashboard DSL.
//
// This is a port of the browser prototype's `DM` engine
// (sources/local/dockermetrics-ide-prototype.html) with the simulated world
// replaced by `require("dockermetrics")`, which reads the real store.
//
// Everything a dashboard author types (`docker()`, `cpu`, `avg`, `by`, `gt`,
// `rule`, `stream`, ...) is defined here and installed as a global before user
// code runs. The engine is deliberately kept in JavaScript so the prototype's
// semantics are preserved exactly; Go only provides the data leaves.
(function () {
  "use strict";

  const core = require("dockermetrics");
  const MAXH = 3600;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const nums = (a) => a.filter((x) => typeof x === "number" && isFinite(x));

  function sec(d) {
    if (typeof d === "number") return d;
    const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(String(d).trim());
    if (!m) throw new Error('bad duration "' + d + '" — use e.g. "30s", "5m", "1h"');
    return parseFloat(m[1]) * ({ ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 }[m[2]]);
  }
  const timeStr = (t) => new Date(t * 1000).toTimeString().slice(0, 8);
  const now = () => core.now();
  class Halt extends Error {}

  /* ── console shim (forwards to the run channel) ── */
  function fmt(v) {
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(Number.isInteger(v) ? v : +v.toFixed(4));
    if (v === undefined) return "undefined";
    if (typeof v === "function") return "[Function]";
    if (v instanceof Error) return v.message;
    try {
      const c = JSON.stringify(v);
      return c.length <= 120 ? c : JSON.stringify(v, null, 2);
    } catch (e) {
      return String(v);
    }
  }
  const consoleShim = {
    log: (...a) => core.log("log", a.map(fmt).join(" ")),
    info: (...a) => core.log("info", a.map(fmt).join(" ")),
    debug: (...a) => core.log("log", a.map(fmt).join(" ")),
    warn: (...a) => core.log("warn", a.map(fmt).join(" ")),
    error: (...a) => core.log("error", a.map(fmt).join(" ")),
    table: (d) => core.log("table", JSON.stringify(toRows(d))),
    clear: () => core.clearLog(),
  };
  function toRows(d) {
    const o = (x) => x && typeof x === "object" && !Array.isArray(x);
    if (Array.isArray(d)) return d.map((x) => (o(x) ? x : { value: x }));
    if (o(d)) return Object.entries(d).map(([k, v]) => (o(v) ? Object.assign({ key: k }, v) : { key: k, value: v }));
    return [{ value: d }];
  }

  /* ── data leaves: build a "sim" view from the store ── */
  function allSims(host) {
    return core.containers(host).map((c) => ({
      name: c.name,
      host: c.host,
      image: c.image,
      state: c.state,
      labels: c.labels || {},
      restarts: c.restarts || 0,
      limit: c.limit || 0,
      pidsLimit: c.pidsLimit || 0,
      hist: core.samples(c.host, c.name, MAXH),
    }));
  }
  function simsFor(host) {
    return allSims(host);
  }

  /* ── ops ── */
  const mkop = (kind, name, fn, extra) => Object.assign({ __op: true, kind, name, fn }, extra);
  const mapop = (name, fn) => mkop("map", name, fn);
  const pct = mapop("pct", (v) => v * 100),
    kb = mapop("kb", (v) => v / 1e3),
    mb = mapop("mb", (v) => v / 1e6),
    gb = mapop("gb", (v) => v / 1e9);
  const round = (n = 0) => mapop("round", (v) => +v.toFixed(n));
  const of = (x) => mapop("of", (v, sim) => v / (x === "limit" ? (sim ? sim.limit : 1) : x));
  const rate = (w = "1s") => mkop("rate", "rate", null, { per: sec(w) });
  const red = (name, fn) => mkop("reduce", name, fn);
  const pq = (q) => (a) => {
    a = nums(a);
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y);
    return s[clamp(Math.ceil(q * s.length) - 1, 0, s.length - 1)];
  };
  const AVG = red("avg", (a) => (a = nums(a)).length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const avg = AVG,
    sum = red("sum", (a) => (a = nums(a)).length ? a.reduce((x, y) => x + y, 0) : null),
    min = red("min", (a) => (a = nums(a)).length ? Math.min(...a) : null),
    max = red("max", (a) => (a = nums(a)).length ? Math.max(...a) : null),
    p50 = red("p50", pq(0.5)),
    p95 = red("p95", pq(0.95)),
    p99 = red("p99", pq(0.99)),
    count = red("count", (a) => a.length);

  function applyOp(o, s, sim) {
    if (o.kind === "map") return s.map((p) => ({ t: p.t, v: o.fn(p.v, sim) }));
    if (o.kind === "rate") {
      const out = [];
      for (let i = 1; i < s.length; i++) out.push({ t: s[i].t, v: ((s[i].v - s[i - 1].v) / (s[i].t - s[i - 1].t || 1)) * o.per });
      return out;
    }
    return s;
  }

  /* ── metrics ── */
  class Metric {
    constructor(name, src, ops) {
      this.name = name;
      this.src = src;
      this.ops = ops || [];
    }
    get pre() {
      const i = this.ops.findIndex((o) => o.kind === "reduce");
      return i < 0 ? this.ops : this.ops.slice(0, i);
    }
    get reducer() {
      return this.ops.find((o) => o.kind === "reduce");
    }
    get post() {
      const i = this.ops.findIndex((o) => o.kind === "reduce");
      return i < 0 ? [] : this.ops.slice(i + 1);
    }
    pipe(...args) {
      const ops = this.ops.slice();
      for (const a of args) {
        if (a && a.__op) ops.push(a);
        else if (a && typeof a === "object" && "window" in a) {
          const i = ops.map((o) => o.kind).lastIndexOf("reduce");
          if (i < 0) throw new Error("{ window } must follow a reducer such as avg or p95");
          ops[i] = Object.assign({}, ops[i], { window: sec(a.window) });
        } else throw new TypeError("pipe(): expected an op like mb, pct, of(...), rate(...), avg, p95 or { window }");
      }
      if (ops.filter((o) => o.kind === "reduce").length > 1) throw new Error("pipe(): only one reducer (avg, sum, max, …) per metric");
      return new Metric(this.name, this.src, ops);
    }
    is(cmp) {
      const m = this;
      if (!cmp || !cmp.__cmp) throw new TypeError("is(): expected a comparator like gt(0.9)");
      return new Pred((ctx, n) => {
        if (m.reducer) {
          let v = valueOf(m, ctx);
          if (v != null) for (const o of m.post) v = o.fn(v, null);
          return [{ t: now(), v: cmp.fn(v) }];
        }
        const s = seriesOf(m, ctx, n);
        return s.slice(-n).map((p) => ({ t: p.t, v: cmp.fn(p.v) }));
      }, 2, m);
    }
  }
  const base = (name, get) => new Metric(name, { kind: "base", get });
  const cpu = base("cpu", (s) => s.cpu);
  const mem = base("mem", (s) => s.mem);
  mem.limit = base("mem.limit", (s, sim) => sim.limit);
  const net = base("net", (s) => ({ rx: s.rx, tx: s.tx }));
  net.rx = base("net.rx", (s) => s.rx);
  net.tx = base("net.tx", (s) => s.tx);
  const io = base("io", (s) => ({ r: s.ior, w: s.iow }));
  io.r = base("io.r", (s) => s.ior);
  io.w = base("io.w", (s) => s.iow);
  const pids = base("pids", (s, sim) => ({ current: s.pids, limit: sim.pidsLimit }));
  pids.current = base("pids.current", (s) => s.pids);
  const metric = (name, fn) => new Metric(name, { kind: "custom", fn });
  const lift = (nm, f) => (a, b) => new Metric(nm + "(" + ((a && a.name) || a) + "," + ((b && b.name) || b) + ")", { kind: "combine", a, b, f });
  const add = lift("add", (x, y) => x + y),
    sub = lift("sub", (x, y) => x - y),
    mul = lift("mul", (x, y) => x * y),
    div = lift("div", (x, y) => (y ? x / y : 0));

  function baseSeries(m, ctx, n) {
    const src = m.src;
    if (src.kind === "base") {
      const h = ctx.sim.hist;
      return h.slice(Math.max(0, h.length - n - 1)).map((x) => ({ t: x.t, v: src.get(x, ctx.sim) }));
    }
    if (src.kind === "custom") return [{ t: now(), v: src.fn(new Container(ctx.dockers, ctx.sim.name, ctx.sim.host)) }];
    const a = src.a instanceof Metric ? seriesOf(src.a, ctx, n) : null;
    const b = src.b instanceof Metric ? seriesOf(src.b, ctx, n) : null;
    if (!a && !b) return [{ t: now(), v: src.f(src.a, src.b) }];
    const L = Math.min(a ? a.length : Infinity, b ? b.length : Infinity),
      ref = a || b,
      out = [];
    for (let i = 0; i < L; i++) out.push({ t: ref[ref.length - L + i].t, v: src.f(a ? a[a.length - L + i].v : src.a, b ? b[b.length - L + i].v : src.b) });
    return out;
  }
  function seriesOf(m, ctx, n) {
    const s = baseSeries(m, ctx, n);
    return m.pre.reduce((acc, o) => applyOp(o, acc, ctx.sim), s);
  }
  function valueOf(m, ctx) {
    const r = m.reducer;
    if (r && r.window) {
      const s = seriesOf(m, ctx, r.window);
      return r.fn(s.map((p) => p.v));
    }
    const s = seriesOf(m, ctx, 2);
    return s.length ? s[s.length - 1].v : undefined;
  }
  function finish(m, vals, r) {
    r = r || m.reducer;
    let v = r ? r.fn(nums(vals)) : null;
    if (v != null) for (const o of m.post) v = o.fn(v, null);
    return v;
  }

  /* ── predicates ── */
  class Pred {
    constructor(fn, need, metric) {
      this.fn = fn;
      this.need = need || 2;
      this.metric = metric || null;
    }
    series(ctx, n) {
      return this.fn(ctx, n);
    }
    eval(ctx) {
      const s = this.fn(ctx, this.need);
      return s.length ? !!s[s.length - 1].v : false;
    }
    and(...p) {
      return and(this, ...p);
    }
    or(...p) {
      return or(this, ...p);
    }
    not() {
      return not(this);
    }
    sustained(d) {
      return sustained(this, d);
    }
  }
  const cmpf = (label, f) => (...a) => ({ __cmp: true, label, fn: (v) => typeof v === "number" && f(v, ...a) });
  const gt = cmpf("gt", (v, x) => v > x),
    gte = cmpf("gte", (v, x) => v >= x),
    lt = cmpf("lt", (v, x) => v < x),
    lte = cmpf("lte", (v, x) => v <= x),
    eq = cmpf("eq", (v, x) => v === x),
    between = cmpf("between", (v, a, b) => v >= a && v <= b);
  const zip = (preds, ctx, n, f) => {
    const ss = preds.map((p) => p.series(ctx, n));
    const L = Math.min(...ss.map((s) => s.length)),
      out = [];
    for (let i = 0; i < L; i++) out.push({ t: ss[0][ss[0].length - L + i].t, v: f(ss.map((s) => s[s.length - L + i].v)) });
    return out;
  };
  const and = (...p) => new Pred((c, n) => zip(p, c, n, (v) => v.every(Boolean)), Math.max(...p.map((x) => x.need)), p[0].metric);
  const or = (...p) => new Pred((c, n) => zip(p, c, n, (v) => v.some(Boolean)), Math.max(...p.map((x) => x.need)), p[0].metric);
  const not = (p) => new Pred((c, n) => zip([p], c, n, (v) => !v[0]), p.need, p.metric);
  const sustained = (p, dur) => {
    const d = Math.round(sec(dur));
    return new Pred((ctx) => {
      const s = p.series(ctx, d);
      if (s.length <= 1) return s;
      const w = s.slice(-d);
      return [{ t: w[w.length - 1].t, v: w.length >= d * 0.98 && w.every((x) => x.v) }];
    }, 2, p.metric);
  };

  /* ── selection ── */
  const glob = (p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
  function matcher(sel, any) {
    const live = (s) => any || s.state !== "stopped";
    if (sel == null) return live;
    if (typeof sel === "string") {
      const r = glob(sel);
      return (s) => r.test(s.name);
    }
    if (sel instanceof RegExp) return (s) => sel.test(s.name);
    if (typeof sel === "function") return sel;
    const t = [];
    if (sel.name) {
      const r = glob(sel.name);
      t.push((s) => r.test(s.name));
    }
    if (sel.label)
      [].concat(sel.label).forEach((l) => {
        const [k, v] = l.split("=");
        t.push((s) => k in s.labels && (v === undefined || s.labels[k] === v));
      });
    if (sel.image) t.push((s) => (sel.image instanceof RegExp ? sel.image.test(s.image) : s.image.startsWith(sel.image)));
    if (sel.host) t.push((s) => s.host === sel.host);
    if (sel.state) t.push((s) => s.state === sel.state);
    else t.push(live);
    return (s) => t.every((f) => f(s));
  }
  const describeSel = (sel) =>
    sel == null
      ? "all running"
      : typeof sel === "string" || sel instanceof RegExp
      ? String(sel)
      : typeof sel === "function"
      ? "custom"
      : Object.entries(sel)
          .map(([k, v]) => k + "=" + v)
          .join(" ");
  const keyOf = (s, k) =>
    k === "name"
      ? s.name
      : k === "image"
      ? s.image
      : k === "host"
      ? s.host
      : k === "state"
      ? s.state
      : k.startsWith("label:")
      ? s.labels[k.slice(6)] != null
        ? s.labels[k.slice(6)]
        : "(none)"
      : (() => {
          throw new Error('by(): unknown key "' + k + '" — use name, image, host, state or label:<key>');
        })();
  function tree(sims, bys, leaf) {
    if (!bys.length) return leaf(sims);
    const g = new Map();
    for (const s of sims) {
      const k = keyOf(s, bys[0].key);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(s);
    }
    const o = {};
    for (const k of [...g.keys()].sort()) o[k] = tree(g.get(k), bys.slice(1), leaf);
    return o;
  }
  const by = (key) => ({ __by: true, key });
  const last = (d) => ({ __win: true, from: () => now() - sec(d) });
  const since = (date) => ({ __win: true, from: () => Math.floor(Date.parse(date) / 1000) });
  const bucket = (size, r) => ({ __bucket: true, size: sec(size), red: r || AVG });
  function bucketize(ser, size, r) {
    const m = new Map();
    for (const p of ser) {
      const k = Math.floor(p.t / size) * size;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p.v);
    }
    return [...m].sort((a, b) => a[0] - b[0]).map(([t, vs]) => ({ t, v: r.fn(vs) }));
  }

  class Report {
    constructor(data, dims) {
      this.data = data;
      this.dims = dims;
    }
    flatten() {
      const rows = [],
        walk = (v, path) => {
          if (Array.isArray(v))
            for (const p of v) {
              const r = {};
              path.forEach((k, i) => (r[this.dims[i] || "k" + i] = k));
              r.t = timeStr(p.t);
              r.v = p.v == null ? null : +p.v.toFixed(3);
              rows.push(r);
            }
          else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path.concat(k));
        };
      walk(this.data, []);
      return rows;
    }
  }

  /* ── groups ── */
  class Group {
    constructor(dockers, sel) {
      this.dockers = dockers;
      this.sel = sel;
      this.test = matcher(sel);
      this.single = false;
    }
    get docker() {
      return this.dockers[0];
    }
    sims() {
      const out = [];
      for (const d of this.dockers) for (const s of simsFor(d.host)) if (this.test(s)) out.push(s);
      return out;
    }
    names() {
      return this.sims().map((s) => s.name);
    }
    get size() {
      return this.sims().length;
    }
    label() {
      return describeSel(this.sel) + (this.dockers.length === 1 ? " @" + this.docker.host : " @fleet");
    }
    on(e, f) {
      this.dockers.forEach((d) => d.on(e, f));
      return this;
    }
    _one(item, sims, bys, single) {
      const ctxs = sims.map((s) => ({ sim: s, dockers: this.dockers })),
        vals = new Map();
      if (item instanceof Pred) {
        for (const c of ctxs) vals.set(c.sim, item.eval(c));
        if (single) return vals.get(sims[0]);
        if (bys.length) return tree(sims, bys, (l) => l.filter((s) => vals.get(s)).length);
        return Object.fromEntries(sims.map((s) => [s.name, vals.get(s)]));
      }
      if (!(item instanceof Metric)) throw new TypeError("read(): expected a metric, a predicate, or { name: metric }");
      for (const c of ctxs) vals.set(c.sim, valueOf(item, c));
      const r = item.reducer;
      if (single) {
        const v = vals.get(sims[0]);
        return r ? finish(item, [v]) : v;
      }
      if (bys.length) return tree(sims, bys, (l) => finish(item, l.map((s) => vals.get(s)), r || AVG));
      if (r) return finish(item, sims.map((s) => vals.get(s)));
      return Object.fromEntries(sims.map((s) => [s.name, vals.get(s)]));
    }
    _read(spec, mods) {
      const bys = mods.filter((m) => m && m.__by),
        sims = this.sims();
      if (this.single && !sims.length) throw new Error("No such container: " + this.name);
      if (spec instanceof Metric || spec instanceof Pred) return this._one(spec, sims, bys, this.single);
      if (spec && typeof spec === "object") {
        const o = {};
        for (const [k, v] of Object.entries(spec)) o[k] = this._one(v, sims, bys, this.single);
        return o;
      }
      throw new TypeError("read(): expected a metric or { name: metric }");
    }
    async read(spec, ...mods) {
      return this._read(spec, mods);
    }
    async check(pred) {
      const r = this._read(pred, []);
      return this.single ? !!r : Object.values(r).some(Boolean);
    }
    history(spec, ...mods) {
      const win = mods.find((m) => m && m.__win),
        bk = mods.find((m) => m && m.__bucket),
        bys = mods.filter((m) => m && m.__by);
      const from = win ? win.from() : now() - MAXH,
        n = Math.min(MAXH, Math.max(2, Math.ceil(now() - from) + 1)),
        sims = this.sims();
      if (this.single && !sims.length) throw new Error("No such container: " + this.name);
      const one = (m) => {
        if (!(m instanceof Metric)) throw new TypeError("history(): expected a metric or { name: metric }");
        const per = new Map();
        for (const s of sims) {
          let ser = seriesOf(m, { sim: s, dockers: this.dockers }, n).filter((p) => p.t >= from);
          if (bk) ser = bucketize(ser, bk.size, bk.red);
          per.set(s, ser);
        }
        const r = m.reducer;
        const comb = (l) => {
          const acc = new Map();
          for (const s of l) for (const p of per.get(s)) {
            if (!acc.has(p.t)) acc.set(p.t, []);
            acc.get(p.t).push(p.v);
          }
          return [...acc].sort((a, b) => a[0] - b[0]).map(([t, vs]) => ({ t, v: finish(m, vs, r || AVG) }));
        };
        if (this.single) return r ? comb(sims) : per.get(sims[0]);
        if (bys.length || r) return tree(sims, bys, comb);
        return Object.fromEntries(sims.map((s) => [s.name, per.get(s)]));
      };
      let data,
        dims = [];
      if (spec instanceof Metric) data = one(spec);
      else if (spec && typeof spec === "object") {
        data = {};
        for (const [k, v] of Object.entries(spec)) data[k] = one(v);
        dims.push("metric");
      } else throw new TypeError("history(): expected a metric or { name: metric }");
      if (this.single) return data;
      dims.push(...(bys.length ? bys.map((b) => b.key) : ["container"]));
      return new Report(data, dims);
    }
    stream(spec, opts, ...mods) {
      if (opts && opts.__by) {
        mods.unshift(opts);
        opts = {};
      }
      return new Stream(this, spec, opts || {}, mods);
    }
    watch(...rules) {
      return new Watcher(this, rules.flat()).start();
    }
    restart(o) {
      core.action("restart", this.names(), o || {});
      return this;
    }
    stop() {
      core.action("stop", this.names(), {});
      return this;
    }
    start() {
      core.action("start", this.names(), {});
      return this;
    }
  }

  class Container extends Group {
    constructor(dockers, name, host) {
      super(dockers, (s) => s.name === name && (!host || s.host === host));
      this.name = name;
      this.single = true;
      this.host = host;
    }
    sims() {
      const out = [];
      for (const d of this.dockers) if (!this.host || d.host === this.host) for (const s of simsFor(d.host)) if (s.name === this.name) out.push(s);
      return out;
    }
    label() {
      return this.name;
    }
    inspect() {
      const s = this.sims()[0];
      return s && { name: s.name, image: s.image, host: s.host, state: s.state, restarts: s.restarts, labels: s.labels };
    }
  }

  /* ── rules & watchers ── */
  class Rule {
    constructor(n) {
      this.name = n;
      this.pred = null;
      this.actions = [];
      this.cd = 0;
    }
    when(p) {
      if (!(p instanceof Pred)) throw new TypeError("when(): expected a predicate such as cpu.is(gt(0.9))");
      this.pred = p;
      return this;
    }
    then(...a) {
      this.actions.push(...a);
      return this;
    }
    cooldown(d) {
      this.cd = sec(d);
      return this;
    }
  }
  const rule = (n) => new Rule(n);
  const emit = (name) => {
    const f = (c, e, d) => core.emitEvent(name, { container: (c && c.name) || null, rule: null });
    f.label = "emit(" + name + ")";
    return f;
  };

  class Watcher {
    constructor(group, rules) {
      this.group = group;
      this.rules = rules;
      this.cool = new Map();
      for (const r of rules) if (!r.pred) throw new Error('rule "' + r.name + '" has no .when(...)');
    }
    start() {
      const me = this;
      this.item = addItem({
        label: "watch " + this.rules.map((r) => r.name).join(", ") + " → " + this.group.label(),
        tick: () => me.tick(),
        stop: () => me.stop(),
      });
      return this;
    }
    stop() {
      if (this.item) removeItem(this.item);
      this.item = null;
      return this;
    }
    on(e, f) {
      this.group.on(e, f);
      return this;
    }
    async tick() {
      for (const sim of this.group.sims()) {
        if (sim.state === "stopped") continue;
        const ctx = { sim, dockers: this.group.dockers };
        for (const r of this.rules) {
          const key = r.name + "|" + sim.name;
          if ((this.cool.get(key) || 0) > now()) continue;
          if (!r.pred.eval(ctx)) continue;
          if (r.cd) this.cool.set(key, now() + r.cd);
          const handle = new Container(this.group.dockers, sim.name, sim.host);
          const value = r.pred.metric ? valueOf(r.pred.metric, ctx) : true;
          const evt = { rule: r.name, container: handle, value, at: now() };
          core.emitEvent(r.name, { container: sim.name, rule: r.name, value });
          for (const a of r.actions) {
            try {
              await a(handle, evt, this.group.docker);
            } catch (e) {
              core.log("error", "rule action failed: " + (e && e.message ? e.message : e));
            }
          }
        }
      }
    }
  }

  /* ── streams & sinks ── */
  class Stream {
    constructor(group, spec, opts, mods) {
      this.group = group;
      this.spec = spec;
      this.every = sec(opts.every || "5s");
      this.mods = mods;
      this.sinks = [];
      this.rules = [];
      this.limit = Infinity;
      this.count = 0;
      this.lastT = -1e9;
      this.q = [];
      this.waiters = [];
      this.started = false;
      this.done = false;
      this.iter = false;
      this.item = null;
      this.watcher = null;
      this.single = spec instanceof Metric || spec instanceof Pred;
      this.flat = spec instanceof Metric && !spec.reducer && !group.single && !mods.some((m) => m && m.__by);
    }
    to(s) {
      if (!s || !s.write) throw new TypeError("to(): expected a sink such as prometheus(), file() or tap()");
      this.sinks.push(s);
      if (!this.started) this.start();
      return this;
    }
    take(n) {
      this.limit = n;
      return this;
    }
    watch(...r) {
      this.rules.push(...r.flat());
      this._watch();
      if (!this.started) this.start();
      return this;
    }
    on(e, f) {
      this.group.on(e, f);
      return this;
    }
    _watch() {
      if (this.rules.length && !this.watcher) this.watcher = new Watcher(this.group, this.rules).start();
    }
    start() {
      if (this.started) return this;
      this.started = true;
      const me = this;
      const names = this.single ? this.spec.name : Object.keys(this.spec).join(",");
      this.item = addItem({ label: "stream " + names + " every " + this.every + "s · " + this.group.label(), tick: () => me.tick(), stop: () => me.stop() });
      this._watch();
      return this;
    }
    tick() {
      if (this.done || now() - this.lastT < this.every) return;
      this.lastT = now();
      const v = this.group._read(this.spec, this.mods);
      const data = this.single ? { [this.spec.name]: v } : v;
      const frame = { t: now(), data, value: v };
      if (this.group.single) frame.container = this.group.name;
      for (const s of this.sinks) {
        try {
          s.write(frame, this);
        } catch (e) {
          core.log("error", "sink failed: " + (e && e.message ? e.message : e));
        }
      }
      if (this.flat) for (const [c, x] of Object.entries(v)) this._push({ t: frame.t, container: c, value: x });
      else this._push(frame);
      if (++this.count >= this.limit) this.stop();
    }
    _push(x) {
      const w = this.waiters.shift();
      if (w) w({ value: x, done: false });
      else this.q.push(x);
    }
    stop() {
      if (this.done) return this;
      this.done = true;
      if (this.item) removeItem(this.item);
      if (this.watcher) this.watcher.stop();
      while (this.waiters.length) this.waiters.shift()({ value: undefined, done: true });
      return this;
    }
    [Symbol.asyncIterator]() {
      this.iter = true;
      this.start();
      const me = this;
      return {
        next() {
          if (me.q.length) return Promise.resolve({ value: me.q.shift(), done: false });
          if (me.done) return Promise.resolve({ value: undefined, done: true });
          return new Promise((r) => me.waiters.push(r));
        },
        return() {
          me.stop();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    }
  }

  const STRUCT = new Set(["rx", "tx", "r", "w", "current", "limit"]);
  function flattenData(data) {
    const out = [],
      cn = new Set(allSims("").map((s) => s.name));
    const walk = (v, name, labels) => {
      if (typeof v === "number") {
        if (isFinite(v)) out.push({ name, labels, v });
      } else if (typeof v === "boolean") out.push({ name, labels, v: +v });
      else if (v && typeof v === "object" && !Array.isArray(v))
        for (const [k, x] of Object.entries(v)) {
          if (STRUCT.has(k)) walk(x, name + "_" + k, labels);
          else {
            const ln = cn.has(k) ? "container" : "group" + (Object.keys(labels).filter((l) => l.startsWith("group")).length || "");
            walk(x, name, Object.assign({}, labels, { [ln]: k }));
          }
        }
    };
    for (const [k, v] of Object.entries(data)) walk(v, k.replace(/[^\w]/g, "_"), {});
    return out;
  }

  const tap = (fn) => ({ __sink: "tap", write: (f) => fn(f) });
  const json = { fmt: (f) => JSON.stringify(Object.assign({ t: f.t }, f.data)) };
  const prometheus = (o = {}) => ({ __sink: "prometheus", write: (f) => core.sink("prometheus", o, { t: f.t, series: flattenData(f.data) }) });
  const statsd = (url, o = {}) => ({ __sink: "statsd", url, opts: o, write: (f) => core.sink("statsd", Object.assign({ url }, o), { t: f.t, series: flattenData(f.data) }) });
  const file = (path, fmt) => ({ __sink: "file", write: (f) => core.sink("file", { path }, { t: f.t, line: (fmt || json).fmt(f) }) });

  /* ── docker handles ── */
  function parseHost(h) {
    if (!h) return "local";
    const s = String(h)
      .replace(/^[a-z+]+:\/\//i, "")
      .replace(/^.*@/, "")
      .replace(/[:/].*$/, "");
    return !s || s === "localhost" || s === "127.0.0.1" ? "local" : s;
  }
  class Docker {
    constructor(o) {
      o = o || {};
      this.host = parseHost(o.host);
      this.uri = o.host || "unix:///var/run/docker.sock";
      this.L = {};
    }
    container(n) {
      return new Container([this], n, this.host);
    }
    containers(sel) {
      return new Group([this], sel);
    }
    on(e, f) {
      (this.L[e] = this.L[e] || []).push(f);
      return this;
    }
    emit(e, p) {
      for (const f of [...(this.L[e] || []), ...(this.L["*"] || [])]) {
        try {
          f(p, e);
        } catch (err) {
          core.log("error", "listener failed: " + (err && err.message ? err.message : err));
        }
      }
    }
  }
  const docker = (o) => new Docker(o);
  const fleet = (ds) => ({
    dockers: ds,
    containers: (sel) => new Group(ds, sel),
    container: (n) => new Container(ds, n),
    on(e, f) {
      ds.forEach((d) => d.on(e, f));
      return this;
    },
  });

  function sleep(d) {
    return core.after(Math.round(sec(d) * 1000));
  }
  const spark = (vals) => {
    vals = nums(vals);
    if (!vals.length) return "";
    const lo = Math.min(...vals),
      hi = Math.max(...vals),
      ch = "▁▂▃▄▅▆▇█";
    return vals.map((v) => ch[hi === lo ? 0 : Math.round(((v - lo) / (hi - lo)) * 7)]).join("");
  };

  const api = {
    docker, fleet, metric, rule, emit, cpu, mem, net, io, pids, pct, mb, kb, gb, round, of, rate,
    avg, sum, min, max, p50, p95, p99, count, by, last, since, bucket,
    gt, gte, lt, lte, eq, between, and, or, not, sustained, add, sub, mul, div,
    prometheus, statsd, json, file, tap, sleep, time: timeStr, now: now, spark,
    Report, Metric, Pred,
  };

  /* ── item registry, driven by the Go ticker ── */
  const items = new Set();
  function addItem(i) {
    items.add(i);
    return i;
  }
  function removeItem(i) {
    items.delete(i);
  }
  function __tick() {
    for (const i of [...items]) {
      try {
        if (i.tick) i.tick();
      } catch (e) {
        core.log("error", "tick failed: " + (e && e.message ? e.message : e));
      }
    }
  }
  function __stopAll() {
    for (const i of [...items]) {
      try {
        if (i.stop) i.stop();
      } catch (e) {}
    }
    items.clear();
  }
  function __itemLabels() {
    return [...items].map((i) => i.label);
  }
  function __hasItems() {
    return items.size > 0;
  }

  /* ── install globals and expose the ticker to Go ── */
  for (const [k, v] of Object.entries(api)) globalThis[k] = v;
  globalThis.console = consoleShim;
  globalThis.time = timeStr;
  globalThis.now = now;

  const bridge = { __tick, __stopAll, __itemLabels, __hasItems, __dmFinish: core._finish };
  for (const [k, v] of Object.entries(bridge)) globalThis[k] = v;
  return bridge;
})();
