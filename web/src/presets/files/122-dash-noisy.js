// @group Dashboards · Scenarios
// @title Noisy neighbours
// @desc Who is hogging CPU, over which window

const all = docker().containers();
const c = cpu.pipe(pct);

dashboard("Noisy neighbours", { every: "3s", range: "15m" })
  .row(
    top("p95 over 10m", all, c.pipe(p95, { window: "10m" }), { unit: "%", n: 8, span: 4, warn: gt(100), crit: gt(200) }),
    donut("Share of CPU now", all, cpu.pipe(sum), by("name"), { span: 4 }),
    bar("CPU now", all, c.pipe(max), by("name"), { unit: "%", span: 4, limit: 8, sort: true })
  )
  .row(sparks("CPU over 15m", all, c, { unit: "%", span: 12, limit: 12, warn: gt(100), crit: gt(200) }))
  .row(
    histogram("How spiky", all, c, { bins: 15, unit: "%", span: 6 }),
    heatmap("When", all, c, { min: 0, max: 200, span: 6 })
  )
  .show();
