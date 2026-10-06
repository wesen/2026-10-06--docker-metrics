// @group Scenarios
// @title Incident drill
// @desc Rules + Prometheus + listeners on the load fleet

const d = docker();
const load = d.containers("*load-*");
const memPct = mem.pipe(of("limit"), pct);

d.on("*", (e, name) => console.log(time(e.at), "⚑", name, "←", e.rule, e.container.name));

load
  .stream({ cpu: cpu.pipe(pct, avg), mem: memPct.pipe(avg) }, { every: "5s" }, by("label:com.docker.compose.service"))
  .to(prometheus({ prefix: "drill_" }))
  .watch(
    rule("cpu-burn").when(sustained(cpu.is(gt(1)), "15s")).then(emit("alert")).cooldown("2m"),
    rule("mem-high").when(memPct.is(gt(50))).then(emit("page")).cooldown("2m")
  );
console.log("drill running on", load.names().join(", ") || "(no load containers — run docker compose up)");
