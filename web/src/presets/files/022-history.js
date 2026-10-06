// @group Aggregation
// @title History, windows and buckets
// @desc last(), bucket(), spark()

const d = docker();
const c = d.container(d.containers().names()[0]);

const rows = await c.history(cpu.pipe(pct), last("10m"), bucket("30s", avg));
console.log(spark(rows.map((r) => r.v)), "<-", c.name, "cpu %, 10 min");
console.table(rows.slice(-6).map((r) => ({ time: time(r.t), "cpu %": r.v == null ? null : +r.v.toFixed(1) })));

const peaks = await c.history(mem.pipe(mb), last("15m"), bucket("5m", max));
console.table(peaks.map((r) => ({ time: time(r.t), "mem MB (peak)": r.v == null ? null : +r.v.toFixed(1) })));
