// Dashboard fixture exercised by the runtime tests and live runs.
const d = docker();
const all = d.containers();

dashboard("Board", { every: "2s", range: "15m" })
  .section("Numbers")
  .row(
    stat("CPU", all, cpu.pipe(pct, avg), { unit: "%", warn: gt(50), crit: gt(80) }),
    gauge("Hottest", all, cpu.pipe(pct, max), { unit: "%", warn: gt(60), crit: gt(85) }),
    kv("Facts", () => ({ containers: all.size, hosts: [...new Set(all.names())].length }))
  )
  .section("Detail")
  .row(
    line("CPU per container", all, cpu.pipe(pct), { unit: "%", span: 8 }),
    top("Memory", all, mem.pipe(mb), { unit: "MB", span: 4 }),
    table("Containers", all,
      { cpu: cpu.pipe(pct), mem: mem.pipe(of("limit"), pct) },
      { sort: "cpu", columns: { cpu: { unit: "%", bar: true, max: 100 }, mem: { unit: "%", bar: true, max: 100 } } }),
    donut("CPU share", all, cpu.pipe(sum), by("name")),
    grid("Health", all, mem.pipe(of("limit"), pct), { warn: gt(70), crit: gt(90) }),
    sparks("Per container", all, cpu.pipe(pct), { unit: "%" }),
    histogram("CPU distribution", all, cpu.pipe(pct), { bins: 6, unit: "%" }),
    events("Recent events", { limit: 5 }),
    text("Notes", "# Board\n- Every widget is a **group + metric + options**")
  )
  .show();

console.log("dashboard defined");
