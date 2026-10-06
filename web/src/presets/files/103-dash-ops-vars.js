// @group Dashboards
// @title Ops board with variables
// @desc var(), range(), groups as functions

// Groups can be functions of the dashboard variables.
// Change the defaults below (the header selects are display-only for now).
const d = docker();
const projectOf = (n) => d.container(n).inspect().labels["com.docker.compose.project"] || "(none)";
const projects = ["all", ...new Set(d.containers().names().map(projectOf))];
const memPct = mem.pipe(of("limit"), pct);
const scope = (v) => d.containers((s) => s.state === "running" && (v.project === "all" || (s.labels["com.docker.compose.project"] || "(none)") === v.project));

dashboard("Ops board", { every: "3s", range: "15m" })
  .var("project", projects, "all")
  .range("15m", ["5m", "15m", "30m"])
  .row(
    stat("CPU", scope, cpu.pipe(pct, avg), { unit: "%", warn: gt(60), crit: gt(85) }),
    stat("Memory", scope, memPct.pipe(avg), { unit: "%", warn: gt(70), crit: gt(90) }),
    stat("Egress", scope, net.tx.pipe(rate("1s"), kb, sum), { unit: "KB/s" }),
    stat("Containers", scope, cpu.pipe(count))
  )
  .row(
    line("CPU by service", scope, cpu.pipe(pct, avg), by("label:com.docker.compose.service"), { unit: "%", span: 7 }),
    donut("Memory share", scope, mem.pipe(mb, sum), by("name"), { span: 5 })
  )
  .row(
    table("By image", scope, { cpu: cpu.pipe(pct, avg), mem: memPct.pipe(avg) }, by("image"),
      { columns: { cpu: { unit: "%", bar: true, max: 200 }, mem: { unit: "%", bar: true, max: 100 } }, span: 5 }),
    heatmap("Memory % heat", scope, memPct, { min: 0, max: 100, span: 7 })
  )
  .show();
