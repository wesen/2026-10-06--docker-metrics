// @group Dashboards · Scenarios
// @title Compose projects
// @desc Breakdown by project and service

const PROJECT = "label:com.docker.compose.project";
const SERVICE = "label:com.docker.compose.service";
const all = docker().containers();
const memPct = mem.pipe(of("limit"), pct);

dashboard("Projects", { every: "3s", range: "15m" })
  .row(
    donut("Memory by project", all, mem.pipe(mb, sum), by(PROJECT), { span: 4 }),
    donut("CPU by project", all, cpu.pipe(sum), by(PROJECT), { span: 4 }),
    bar("Containers per project", all, cpu.pipe(count), by(PROJECT), { span: 4 })
  )
  .row(
    area("Memory by project (stacked)", all, mem.pipe(mb, sum), by(PROJECT), { unit: "MB", stack: true, span: 6 }),
    line("CPU by project", all, cpu.pipe(pct, sum), by(PROJECT), { unit: "%", span: 6 })
  )
  .row(
    table("Projects", all, { cpu: cpu.pipe(pct, sum), mem_mb: mem.pipe(mb, sum), mem_pct: memPct.pipe(avg) }, by(PROJECT),
      { sort: "cpu", span: 6, columns: { cpu: { unit: "%", bar: true }, mem_mb: { unit: "MB", dec: 0 }, mem_pct: { unit: "%", dec: 1 } } }),
    sparks("CPU by service", all, cpu.pipe(pct, avg), by(SERVICE), { unit: "%", span: 6, limit: 10 })
  )
  .show();
