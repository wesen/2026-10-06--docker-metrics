export interface Preset {
  id: string;
  group: string;
  title: string;
  desc: string;
  code: string;
}

// Presets ported from the prototype's PRESETS array (subset that runs against
// the live store). Each is a self-contained dashboard program.
export const PRESETS: Preset[] = [
  {
    id: "one-metric",
    group: "Basics",
    title: "One container, one metric",
    desc: "Read a single number",
    code: `const web = docker().containers().names()[0];
const c = docker().container(web);
console.log("cpu", await c.read(cpu), "(fraction of one core)");
console.log("cpu %", await c.read(cpu.pipe(pct)));
console.log("mem bytes", await c.read(mem), "-> MB", await c.read(mem.pipe(mb)));
`,
  },
  {
    id: "multi-metric",
    group: "Basics",
    title: "Several metrics at once",
    desc: "Pass an object, get an object",
    code: `const c = docker().container(docker().containers().names()[0]);
const snap = await c.read({ cpu, mem, net, io, pids });
console.log(snap);
console.log("rx so far:", await c.read(net.rx), "bytes");
`,
  },
  {
    id: "selectors",
    group: "Basics",
    title: "Selecting containers",
    desc: "Name, glob, label, image, host",
    code: `const d = docker();
const show = (label, group) => console.log(label.padEnd(22), group.names().join(", ") || "—");
show("container(first)", d.containers());
show("label tier=backend", d.containers({ label: "tier=backend" }));
show("image /^node/", d.containers({ image: /^node/ }));
show("all running", d.containers());
`,
  },
  {
    id: "units",
    group: "Basics",
    title: "Units and derived values",
    desc: "Pipes: mb, of(), pct, rate",
    code: `const c = docker().container(docker().containers().names()[0]);
console.log("mem (MB)      ", await c.read(mem.pipe(mb)));
console.log("mem % of limit", await c.read(mem.pipe(of("limit"), pct)));
console.log("rx bytes/sec  ", await c.read(net.rx.pipe(rate("1s"))));
console.log("tx MB/min     ", await c.read(net.tx.pipe(rate("1m"), mb)));
`,
  },
  {
    id: "aggregate",
    group: "Aggregation",
    title: "Aggregation across a group",
    desc: "avg, sum, max, p95",
    code: `const d = docker();
console.log("avg cpu    ", await d.containers().read(cpu.pipe(avg)));
console.log("total memMB", await d.containers().read(mem.pipe(sum, mb)));
console.log("busiest    ", await d.containers().read(cpu.pipe(max)));
console.log("cpu p95/5m ", await d.containers().read(cpu.pipe(p95, { window: "5m" })));
`,
  },
  {
    id: "grouping",
    group: "Aggregation",
    title: "Grouping with by()",
    desc: "Nest results by service, image or host",
    code: `const d = docker();
console.log("cpu by host");
console.log(await d.containers().read(cpu.pipe(avg), by("host")));
console.log("mem MB by image");
console.log(await d.containers().read(mem.pipe(sum, mb), by("image")));
`,
  },
  {
    id: "history",
    group: "Aggregation",
    title: "History and buckets",
    desc: "last(), bucket(), spark()",
    code: `const name = docker().containers().names()[0];
const c = docker().container(name);
const rows = await c.history(cpu.pipe(pct), last("15m"), bucket("1m", avg));
console.log(spark(rows.map((r) => r.v)), "<-", name, "cpu %, 15 min");
console.log("points:", rows.length);
`,
  },
  {
    id: "predicates",
    group: "Alerts",
    title: "Predicates",
    desc: "is(), and/or/not",
    code: `const d = docker();
const hot = cpu.is(gt(0.9));
const bloat = mem.pipe(of("limit")).is(gt(0.85));
const sick = or(hot, bloat);
console.log("hot:", await d.containers().read(hot));
console.log("sick:", await d.containers().read(sick));
`,
  },
  {
    id: "rules",
    group: "Alerts",
    title: "Rules: when -> then",
    desc: "Emit on sustained CPU",
    code: `const d = docker();
d.containers()
  .watch(
    rule("cpu-saturation")
      .when(sustained(cpu.is(gt(0.9)), "2m"))
      .then(emit("alert"))
      .cooldown("10m")
  );
console.log("watching for sustained CPU > 90%");
`,
  },
  {
    id: "stream",
    group: "Streaming",
    title: "Streaming to the WebSocket hub",
    desc: "Live frames on topic svc",
    code: `const d = docker();
d.containers()
  .stream({ cpu: cpu.pipe(pct, avg), mem: mem.pipe(of("limit"), pct, avg) }, { every: "1s" }, by("host"))
  .to(ws("svc"));
console.log("streaming every 1s on topic svc");
`,
  },
  {
    id: "sinks",
    group: "Streaming",
    title: "Sinks: Prometheus and tap",
    desc: "Open /metrics and the Sinks tab",
    code: `const d = docker();
d.containers()
  .stream({ cpu, mem: mem.pipe(mb) }, { every: "2s" })
  .to(prometheus({ prefix: "dock_" }))
  .to(tap((f) => console.log(time(f.t), f.data)));
`,
  },
  {
    id: "custom",
    group: "Advanced",
    title: "Custom metrics",
    desc: "Define your own primitive",
    code: `const d = docker();
const pidsRatio = metric("pids-ratio", (c) => {
  const { current, limit } = c.read(pids);
  return limit ? current / limit : 0;
});
console.log("pids ratio", await d.containers().read(pidsRatio));
console.log("db pids < 10%?", await d.container(d.containers().names()[0]).read(pidsRatio.is(lt(0.1))));
`,
  },
  {
    id: "scratch",
    group: "Sandbox",
    title: "Scratchpad",
    desc: "Blank page and cheat-sheet",
    code: `// metrics   cpu  mem  net  io  pids   (+ net.rx net.tx io.r io.w mem.limit)
// units     mb kb gb pct of("limit") rate("1s") round(n)
// reduce    avg sum min max p50 p95 p99 count  — add { window: "5m" }
// compare   gt gte lt lte eq between  -> metric.is(gt(0.9))
// combine   and or not sustained(pred, "2m")
// shape     by("label:service")  by("host")  last("15m")  bucket("1m", avg)
// act       rule(name).when(p).then(emit("x")).cooldown("10m")
// stream    group.stream({cpu}, {every:"1s"}).to(ws("topic"))

const d = docker();
console.log(await d.containers().read(cpu.pipe(avg), by("host")));
`,
  },
];

export const PRESET_GROUPS = PRESETS.reduce<{ name: string; items: Preset[] }[]>((acc, p) => {
  let g = acc.find((x) => x.name === p.group);
  if (!g) acc.push((g = { name: p.group, items: [] }));
  g.items.push(p);
  return acc;
}, []);
