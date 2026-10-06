// @group Dashboards · Scenarios
// @title Capacity planner
// @desc p95 vs limits with advice

const all = docker().containers();
const memPct = mem.pipe(of("limit"), pct);
const p95mem = memPct.pipe(p95, { window: "15m" });

dashboard("Capacity", { every: "5s", range: "30m" })
  .row(
    stat("Fleet p95 mem", all, p95mem.pipe(round(1)), { unit: "%" }),
    stat("Limits total", all, mem.limit.pipe(mb, sum), { unit: "MB", dec: 0 }),
    stat("Used total", all, mem.pipe(mb, sum), { unit: "MB", dec: 0 }),
    kv("Advice", async () => {
      const v = await all.read(p95mem, by("name"));
      const out = {};
      for (const [n, x] of Object.entries(v)) out[n.slice(-22)] = x > 80 ? "raise limit" : x < 10 ? "can shrink" : "ok";
      return out;
    })
  )
  .row(
    bar("p95 memory % of limit (15m)", all, p95mem, by("name"), { unit: "%", span: 8, sort: true }),
    grid("Right now", all, memPct, { unit: "%", warn: gt(60), crit: gt(85), span: 4 })
  )
  .row(table("Plan", all, { p95: p95mem, max: memPct.pipe(max, { window: "15m" }), used_mb: mem.pipe(mb), limit_mb: mem.limit.pipe(mb) },
    { sort: "p95", columns: { p95: { unit: "%", bar: true, max: 100, warn: gt(70), crit: gt(85) }, max: { unit: "%", dec: 1 }, used_mb: { unit: "MB", dec: 0 }, limit_mb: { unit: "MB", dec: 0 } } }))
  .show();
