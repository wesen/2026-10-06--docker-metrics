// @group Dashboards · Resources
// @title CPU deep dive
// @desc Percentiles, heat and distribution

const all = docker().containers();
const c = cpu.pipe(pct);

dashboard("CPU", { every: "3s", range: "15m" })
  .row(
    stat("Total", all, cpu.pipe(pct, sum), { unit: "%", desc: "100% = one core" }),
    stat("Median container", all, c.pipe(p50), { unit: "%" }),
    stat("p95 container", all, c.pipe(p95), { unit: "%", warn: gt(100), crit: gt(200) }),
    stat("Max", all, c.pipe(max), { unit: "%", warn: gt(100), crit: gt(200) })
  )
  .row(
    line("CPU per container", all, c, { unit: "%", span: 8 }),
    top("p95 over 5m", all, c.pipe(p95, { window: "5m" }), { unit: "%", n: 7, span: 4, warn: gt(100), crit: gt(200) })
  )
  .row(
    heatmap("Heat", all, c, { min: 0, max: 200, span: 8 }),
    histogram("Distribution", all, c, { bins: 12, unit: "%", span: 4 })
  )
  .row(table("Windows", all, { now: c, avg5m: c.pipe(avg, { window: "5m" }), p95_5m: c.pipe(p95, { window: "5m" }), max5m: c.pipe(max, { window: "5m" }) },
    { sort: "p95_5m", columns: { now: { unit: "%", dec: 1 }, avg5m: { unit: "%", dec: 1 }, p95_5m: { unit: "%", dec: 1, bar: true, max: 400 }, max5m: { unit: "%", dec: 1 } } }))
  .show();
