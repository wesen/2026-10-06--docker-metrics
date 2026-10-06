// @group Aggregation
// @title Percentiles over windows
// @desc p50 / p95 / p99 per container

const d = docker();
const all = d.containers();
const c = cpu.pipe(pct);
const f1 = (x) => (x == null ? null : +x.toFixed(1)); // null until a container has samples

const p50s = await all.read(c.pipe(p50, { window: "5m" }));
const p95s = await all.read(c.pipe(p95, { window: "5m" }));
const p99s = await all.read(c.pipe(p99, { window: "5m" }));

// Without by(), a reducer collapses the group; by("name") keeps one value per container.
const per = (m) => all.read(c.pipe(m, { window: "5m" }), by("name"));
const [a, b, e] = await Promise.all([per(p50), per(p95), per(p99)]);
console.log("fleet p50/p95/p99:", f1(p50s), f1(p95s), f1(p99s));
console.table(Object.keys(a).map((n) => ({ container: n, p50: f1(a[n]), p95: f1(b[n]), p99: f1(e[n]) })));
