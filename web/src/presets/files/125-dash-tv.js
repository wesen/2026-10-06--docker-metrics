// @group Dashboards · Scenarios
// @title TV wall
// @desc Big numbers only, refreshes every 2s

const all = docker().containers();
const big = { h: 150 };

dashboard("Wall", { every: "2s", range: "5m" })
  .row(
    stat("CPU", all, cpu.pipe(pct, sum), Object.assign({ unit: "%", warn: gt(300), crit: gt(500) }, big)),
    stat("Memory", all, mem.pipe(gb, sum), Object.assign({ unit: "GB", dec: 2 }, big)),
    stat("Ingress", all, net.rx.pipe(rate("1s"), kb, sum), Object.assign({ unit: "KB/s" }, big)),
    stat("Containers", all, cpu.pipe(count), big)
  )
  .row(grid("Fleet", all, cpu.pipe(pct), { unit: "%", warn: gt(100), crit: gt(200), span: 12, h: 200 }))
  .show();
