// @group Dashboards
// @title Live incident room
// @desc Board + rules + events together

const d = docker();
const all = d.containers();
const memPct = mem.pipe(of("limit"), pct);

d.on("page", (e) => console.warn("📟 page:", e.container.name, e.rule));
all.watch(
  rule("cpu-burn").when(sustained(cpu.is(gt(1)), "15s")).then(emit("alert")).cooldown("2m"),
  rule("mem-high").when(sustained(memPct.is(gt(60)), "20s")).then(emit("page")).cooldown("3m")
);

dashboard("Incident room", { every: "2s", range: "10m" })
  .row(
    stat("CPU", all, cpu.pipe(pct, avg), { unit: "%", warn: gt(50), crit: gt(80) }),
    stat("Memory", all, memPct.pipe(avg), { unit: "%", warn: gt(50), crit: gt(75) }),
    kv("Restarts", () => {
      const r = Object.fromEntries(all.names().map((n) => [n.slice(-24), d.container(n).inspect().restarts]).filter((e) => e[1]));
      return Object.keys(r).length ? r : { restarts: "none" };
    })
  )
  .row(
    line("CPU", all, cpu.pipe(pct), { unit: "%", span: 6 }),
    line("Memory % of limit", all, memPct, { unit: "%", span: 6 })
  )
  .row(
    grid("State", all, memPct, { warn: gt(50), crit: gt(75), unit: "%", span: 6 }),
    events("Timeline", { types: ["rule", "emit"], limit: 12, span: 6 })
  )
  .show();
