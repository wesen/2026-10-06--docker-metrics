// @group Dashboards · Scenarios
// @title Load generator lab
// @desc The docker compose demo fleet, one row per generator

// Start the fleet with:  docker compose up --build
const d = docker();
const load = d.containers("*load-*");
const memPct = mem.pipe(of("limit"), pct);
const short = (n) => n.replace(/^.*load-/, "load-").replace(/-\d+$/, "");

const board = dashboard("Load lab", { every: "2s", range: "10m" })
  .row(
    stat("Generators", load, cpu.pipe(count)),
    stat("CPU burned", load, cpu.pipe(pct, sum), { unit: "%", desc: "100% = one core" }),
    stat("Memory held", load, mem.pipe(mb, sum), { unit: "MB", dec: 0 }),
    gauge("Leak vs limit", d.containers("*load-leak*"), memPct.pipe(max), { unit: "%", warn: gt(60), crit: gt(85) })
  )
  .row(
    line("CPU (bursts every 15–30s)", load, cpu.pipe(pct), { unit: "%", span: 6 }),
    line("Memory (sawtooth vs leak)", load, mem.pipe(mb), { unit: "MB", span: 6 })
  );
for (const n of load.names()) {
  const g = d.container(n);
  board.row(
    stat(short(n) + " cpu", g, cpu.pipe(pct), { unit: "%", span: 3 }),
    stat(short(n) + " mem", g, memPct, { unit: "%", span: 3, warn: gt(60), crit: gt(85) }),
    sparks(short(n), g, cpu.pipe(pct), { unit: "%", span: 6 })
  );
}
board
  .row(text("Profiles", "# Generators\n- **load-cpu**: 1.5 cores, 8s spikes every 30s\n- **load-mem**: sawtooth to 300 MB\n- **load-leak**: grows to 420 MB and holds\n- **load-burst**: mixed CPU + memory bursts"))
  .show();
if (!load.size) console.warn("no *load-* containers found — run docker compose up --build");
