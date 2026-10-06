// @group Dashboards
// @title Composed from functions
// @desc One section per compose project, built in a loop

// Widgets are values: build them with functions and loops.
const d = docker();
const kpi = (title, g, m, o) => stat(title, g, m, Object.assign({ unit: "%", warn: gt(60), crit: gt(85), span: 3 }, o || {}));
const cpuPct = cpu.pipe(pct), memPct = mem.pipe(of("limit"), pct);
const projects = [...new Set(d.containers().names().map((n) => d.container(n).inspect().labels["com.docker.compose.project"]).filter(Boolean))];

const board = dashboard("Per project", { every: "4s", range: "10m" });
for (const project of projects) {
  const g = d.containers({ label: "com.docker.compose.project=" + project });
  board.section(project).row(
    kpi("cpu", g, cpuPct.pipe(avg)),
    kpi("memory", g, memPct.pipe(avg), { warn: gt(70), crit: gt(90) }),
    sparks("replicas", g, cpuPct, { unit: "%", span: 6, warn: gt(100) })
  );
}
if (!projects.length) board.row(text("No compose projects", "Start the demo fleet with `docker compose up`."));
board.show();
console.log("sections:", projects.join(", "));
