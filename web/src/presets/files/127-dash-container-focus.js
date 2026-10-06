// @group Dashboards · Scenarios
// @title Single container focus
// @desc Everything about one container

// Change FOCUS to any container name (the first running one by default).
const d = docker();
const FOCUS = d.containers().names()[0];
const c = d.container(FOCUS);
const memPct = mem.pipe(of("limit"), pct);

dashboard("Focus: " + FOCUS, { id: "focus", every: "2s", range: "15m" })
  .row(
    stat("CPU", c, cpu.pipe(pct), { unit: "%", warn: gt(100), crit: gt(200) }),
    stat("Memory", c, mem.pipe(mb), { unit: "MB", dec: 0 }),
    gauge("Of limit", c, memPct, { unit: "%", warn: gt(60), crit: gt(85) }),
    kv("Container", () => {
      const i = c.inspect();
      return { image: i.image, state: i.state, restarts: i.restarts, project: i.labels["com.docker.compose.project"] || "—" };
    })
  )
  .row(
    line("CPU and memory %", c, { cpu: cpu.pipe(pct), mem: memPct }, { unit: "%", span: 8 }),
    histogram("CPU distribution", c, cpu.pipe(pct), { bins: 10, unit: "%", span: 4 })
  )
  .row(
    line("Network KB/s", c, { rx: net.rx.pipe(rate("1s"), kb), tx: net.tx.pipe(rate("1s"), kb) }, { unit: "KB/s", span: 6 }),
    line("Disk KB/s", c, { read: io.r.pipe(rate("1s"), kb), write: io.w.pipe(rate("1s"), kb) }, { unit: "KB/s", span: 6 })
  )
  .show();
