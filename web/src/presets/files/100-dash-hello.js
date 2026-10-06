// @group Dashboards
// @title Hello, dashboard
// @desc stat, gauge, line, top in a few lines

// Open the Dashboard tab after running. A board refreshes every `every`.
const all = docker().containers();

dashboard("Fleet at a glance", { every: "2s", range: "10m" })
  .row(
    stat("Avg CPU", all, cpu.pipe(pct, avg), { unit: "%", warn: gt(60), crit: gt(85) }),
    stat("Total memory", all, mem.pipe(mb, sum), { unit: "MB", dec: 0 }),
    stat("Containers", all, cpu.pipe(count)),
    gauge("Busiest", all, cpu.pipe(pct, max), { unit: "%", max: 400, warn: gt(150), crit: gt(300) })
  )
  .row(
    line("CPU by container", all, cpu.pipe(pct), { unit: "%", span: 8 }),
    top("Memory", all, mem.pipe(mb), { unit: "MB", span: 4, dec: 0 })
  )
  .show();
console.log("dashboard live → Dashboard tab");
