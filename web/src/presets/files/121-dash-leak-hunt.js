// @group Dashboards · Scenarios
// @title Leak hunt
// @desc Growth rate, rules and a timeline

const d = docker();
const all = d.containers();
const growth = mem.pipe(rate("1m"), mb); // MB per minute
const memPct = mem.pipe(of("limit"), pct);
const growing = metric("growing", (c) => (c.read(growth) > 1 ? 1 : 0));

all.watch(rule("growing").when(sustained(growth.is(gt(2)), "30s")).then(emit("leak")).cooldown("3m"));

dashboard("Leak hunt", { every: "3s", range: "15m" })
  .row(
    stat("Fastest growth", all, growth.pipe(max), { unit: "MB/min", dec: 1, warn: gt(2), crit: gt(10) }),
    stat("Growing > 1 MB/min", all, growing.pipe(sum), { warn: gt(0) }),
    gauge("Worst of limit", all, memPct.pipe(max), { unit: "%", warn: gt(60), crit: gt(85) })
  )
  .row(
    line("Working set", all, mem.pipe(mb), { unit: "MB", span: 8 }),
    top("Growth MB/min", all, growth, { unit: "MB/min", n: 6, dec: 1, span: 4, warn: gt(2), crit: gt(10) })
  )
  .row(
    sparks("Growth trend", all, growth, { unit: "MB/min", span: 6 }),
    events("Leak alerts", { types: ["rule", "emit"], limit: 10, span: 6 })
  )
  .show();
