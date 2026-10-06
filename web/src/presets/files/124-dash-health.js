// @group Dashboards · Scenarios
// @title Health and restarts
// @desc States, restarts and stopped containers

const d = docker();
const everything = d.containers((s) => true);
const running = d.containers();

dashboard("Health", { every: "3s", range: "10m" })
  .row(
    stat("Running", running, cpu.pipe(count)),
    kv("By state", () => {
      const out = {};
      for (const n of everything.names()) {
        const st = d.container(n).inspect().state;
        out[st] = (out[st] || 0) + 1;
      }
      return out;
    }),
    kv("Restarts", () => {
      const r = Object.fromEntries(everything.names().map((n) => [n.slice(-24), d.container(n).inspect().restarts]).filter((e) => e[1] > 0));
      return Object.keys(r).length ? r : { restarts: "none" };
    }),
    text("Not running", () => {
      const down = d.containers((s) => s.state !== "running").names();
      return down.length ? "# Not running\n" + down.map((n) => "- " + n).join("\n") : "# All good\nEvery known container is running.";
    })
  )
  .row(
    grid("CPU", running, cpu.pipe(pct), { unit: "%", warn: gt(100), crit: gt(200), span: 6 }),
    grid("Memory of limit", running, mem.pipe(of("limit"), pct), { unit: "%", warn: gt(60), crit: gt(85), span: 6 })
  )
  .row(events("Events", { limit: 10 }))
  .show();
