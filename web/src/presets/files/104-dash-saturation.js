// @group Dashboards
// @title Saturation
// @desc maxOf(), custom metric, async kv()

// Saturation: whichever resource is closer to its limit, as a percent.
const all = docker().containers();
const saturation = maxOf(cpu, mem.pipe(of("limit"))).pipe(pct);
const pidUse = metric("pid-use", (c) => {
  const p = c.read(pids);
  return p && p.limit ? (p.current / p.limit) * 100 : 0;
});

dashboard("Saturation", { every: "3s", range: "10m" })
  .row(
    gauge("Fleet saturation", all, saturation.pipe(avg), { unit: "%", max: 200, warn: gt(60), crit: gt(85) }),
    gauge("Worst container", all, saturation.pipe(max), { unit: "%", max: 200, warn: gt(70), crit: gt(90) }),
    gauge("PID pressure", all, pidUse.pipe(max), { unit: "%", warn: gt(20), crit: gt(50) }),
    kv("Budget", async () => {
      const worst = await all.read(saturation.pipe(max));
      return { worst: worst.toFixed(0) + "%", verdict: worst > 85 ? "act now" : worst > 60 ? "watch" : "healthy" };
    })
  )
  .row(
    line("Saturation per container", all, saturation, { unit: "%", span: 8 }),
    top("Most saturated", all, saturation, { unit: "%", n: 6, span: 4, warn: gt(60), crit: gt(85) })
  )
  .row(text("How to read", "# Saturation\nThe larger of **CPU (cores)** and **memory of limit**, in percent.\n- under 60: healthy\n- 60–85: watch\n- over 85: act"))
  .show();
