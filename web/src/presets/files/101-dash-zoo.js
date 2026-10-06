// @group Dashboards
// @title Widget zoo
// @desc All fifteen widget types on one board

const PROJECT = "label:com.docker.compose.project";
const d = docker();
const all = d.containers();
const memPct = mem.pipe(of("limit"), pct);

dashboard("Widget zoo", { every: "3s", range: "15m" })
  .section("Numbers")
  .row(
    stat("Avg CPU", all, cpu.pipe(pct, avg), { unit: "%", warn: gt(50), crit: gt(80) }),
    stat("Avg memory", all, memPct.pipe(avg), { unit: "%", warn: gt(60), crit: gt(85) }),
    gauge("Hottest", all, cpu.pipe(pct, max), { unit: "%", max: 400, warn: gt(150), crit: gt(300) }),
    kv("Facts", () => ({ containers: all.size, projects: new Set(all.names().map((n) => d.container(n).inspect().labels["com.docker.compose.project"] || "—")).size }))
  )
  .section("Time series")
  .row(
    line("CPU per container", all, cpu.pipe(pct), { unit: "%" }),
    area("Memory by project (stacked)", all, mem.pipe(mb, sum), by(PROJECT), { unit: "MB", stack: true })
  )
  .section("Breakdowns")
  .row(
    bar("Memory per project", all, mem.pipe(mb, sum), by(PROJECT), { unit: "MB", dec: 0 }),
    donut("CPU share", all, cpu.pipe(sum), by("name")),
    top("Busiest p95 / 5m", all, cpu.pipe(pct, p95, { window: "5m" }), { unit: "%", n: 5, warn: gt(60), crit: gt(85) })
  )
  .section("Detail")
  .row(
    table("Containers", all,
      { cpu: cpu.pipe(pct), mem: memPct, rx: net.rx.pipe(rate("1s"), kb) },
      { sort: "cpu", limit: 10, columns: {
          cpu: { unit: "%", bar: true, warn: gt(60), crit: gt(85), max: 200 },
          mem: { unit: "%", bar: true, warn: gt(70), crit: gt(90), max: 100 },
          rx: { unit: "KB/s", dec: 1 } } }),
    heatmap("CPU heat, last 15m", all, cpu.pipe(pct), { min: 0, max: 200 })
  )
  .row(
    grid("Health", all, memPct, { warn: gt(60), crit: gt(85), unit: "%" }),
    histogram("CPU distribution", all, cpu.pipe(pct), { bins: 10, unit: "%" }),
    sparks("CPU sparklines", all, cpu.pipe(pct), { unit: "%", warn: gt(100) })
  )
  .row(
    events("Recent events", { limit: 6 }),
    text("Notes", "# Reading this board\n- Cards turn **amber/red** at warn/crit\n- Every widget is a *group + metric + options*\n- Edit the source and press Run to change it")
  )
  .show();
