// @group Dashboards · Scenarios
// @title Compare two groups
// @desc Load generators vs everything else

const d = docker();
const load = d.containers("*load-*");
const rest = d.containers((s) => s.state === "running" && !/load-/.test(s.name));

dashboard("Load vs rest", { every: "3s", range: "10m" })
  .section("Load generators")
  .row(
    stat("CPU", load, cpu.pipe(pct, sum), { unit: "%" }),
    stat("Memory", load, mem.pipe(mb, sum), { unit: "MB", dec: 0 }),
    line("CPU", load, cpu.pipe(pct), { unit: "%", span: 6 })
  )
  .section("Everything else")
  .row(
    stat("CPU", rest, cpu.pipe(pct, sum), { unit: "%" }),
    stat("Memory", rest, mem.pipe(mb, sum), { unit: "MB", dec: 0 }),
    line("CPU", rest, cpu.pipe(pct), { unit: "%", span: 6 })
  )
  .show();
