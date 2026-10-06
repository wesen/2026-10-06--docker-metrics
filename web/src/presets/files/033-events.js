// @group Alerts
// @title Wildcard listener
// @desc d.on('*') sees every emitted event

const d = docker();
d.on("*", (e, name) => console.log(time(e.at), "⚑", name.padEnd(8), e.container.name));

const memPct = mem.pipe(of("limit"), pct);
d.containers().watch(
  rule("warm").when(cpu.is(gt(0.3))).then(emit("warm")).cooldown("1m"),
  rule("heavy").when(memPct.is(gt(40))).then(emit("heavy")).cooldown("1m")
);
console.log("listening to every event…");
