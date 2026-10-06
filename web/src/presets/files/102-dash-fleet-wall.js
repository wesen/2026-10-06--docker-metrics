// @group Dashboards
// @title Fleet wall
// @desc Health tiles, heat and histograms

const SERVICE = "label:com.docker.compose.service";
const g = docker().containers();
const memPct = mem.pipe(of("limit"), pct);

dashboard("Fleet wall", { every: "3s", range: "15m" })
  .row(
    grid("CPU", g, cpu.pipe(pct), { unit: "%", warn: gt(80), crit: gt(150), span: 6 }),
    grid("Memory of limit", g, memPct, { unit: "%", warn: gt(60), crit: gt(85), span: 6 })
  )
  .row(
    bar("CPU by image", g, cpu.pipe(pct, sum), by("image"), { unit: "%", span: 4 }),
    histogram("Memory distribution", g, memPct, { bins: 10, unit: "%", span: 4 }),
    top("Egress KB/s", g, net.tx.pipe(rate("1s"), kb), { unit: "KB/s", n: 5, span: 4 })
  )
  .row(heatmap("CPU heat by container", g, cpu.pipe(pct), { min: 0, max: 200 }))
  .row(sparks("CPU by service", g, cpu.pipe(pct, avg), by(SERVICE), { unit: "%", span: 12 }))
  .show();
