// @group Dashboards · Scenarios
// @title Efficiency
// @desc Composed metrics: CPU per GB, saturation

const all = docker().containers();
const cpuPerGB = div(cpu.pipe(pct), mem.pipe(gb));
const idle = metric("idle", (c) => (c.read(cpu) < 0.01 ? 1 : 0));

dashboard("Efficiency", { every: "4s", range: "15m" })
  .row(
    stat("Idle containers", all, idle.pipe(sum), { desc: "under 1% of a core" }),
    stat("CPU % per GB (fleet)", all, cpuPerGB.pipe(avg), { dec: 1 }),
    stat("Memory parked in idle", all, mul(idle, mem.pipe(mb)).pipe(sum), { unit: "MB", dec: 0 })
  )
  .row(
    top("CPU % per GB", all, cpuPerGB, { n: 7, dec: 1, span: 6 }),
    table("Idle check", all, { cpu: cpu.pipe(pct), mem_mb: mem.pipe(mb), idle }, { sort: "mem_mb", span: 6,
      columns: { cpu: { unit: "%", dec: 2 }, mem_mb: { unit: "MB", dec: 0, bar: true }, idle: { dec: 0 } } })
  )
  .show();
