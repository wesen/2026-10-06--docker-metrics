// @group Dashboards · Resources
// @title Memory pressure
// @desc Working set, limits and headroom

const all = docker().containers();
const memPct = mem.pipe(of("limit"), pct);
const headroomMB = metric("headroom-mb", (c) => (c.read(mem.limit) - c.read(mem)) / 1e6);

dashboard("Memory", { every: "3s", range: "15m" })
  .row(
    stat("Working set", all, mem.pipe(mb, sum), { unit: "MB", dec: 0 }),
    stat("Avg of limit", all, memPct.pipe(avg), { unit: "%", warn: gt(60), crit: gt(85) }),
    gauge("Worst of limit", all, memPct.pipe(max), { unit: "%", warn: gt(70), crit: gt(90) }),
    stat("Tightest headroom", all, headroomMB.pipe(min), { unit: "MB", dec: 0, warn: lt(200), crit: lt(50) })
  )
  .row(
    area("Working set (stacked)", all, mem.pipe(mb), { unit: "MB", stack: true, span: 8 }),
    top("Least headroom", all, headroomMB, { unit: "MB", n: 6, asc: true, dec: 0, span: 4 })
  )
  .row(
    grid("Of limit", all, memPct, { unit: "%", warn: gt(60), crit: gt(85), span: 6 }),
    histogram("Distribution of % of limit", all, memPct, { bins: 10, unit: "%", span: 6 })
  )
  .row(table("Containers", all, { mb: mem.pipe(mb), limit: mem.limit.pipe(mb), pct: memPct, growth: mem.pipe(rate("1m"), mb) },
    { sort: "pct", columns: { mb: { unit: "MB", dec: 0 }, limit: { unit: "MB", dec: 0 }, pct: { unit: "%", bar: true, max: 100, warn: gt(60), crit: gt(85) }, growth: { unit: "MB/min", dec: 2 } } }))
  .show();
