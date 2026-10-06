// @group Scenarios
// @title Capacity planner
// @desc p95 memory vs limit, with advice

const d = docker();
const p95mem = await d.containers().read(mem.pipe(of("limit"), pct, p95, { window: "15m" }), by("name"));

console.table(
  Object.entries(p95mem).filter((e) => e[1] != null).map(([name, v]) => ({
    container: name,
    "p95 mem %": +v.toFixed(1),
    advice: v > 80 ? "raise limit" : v < 10 ? "can shrink" : "ok",
  }))
);
