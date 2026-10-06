// @group Alerts
// @title Rules: when -> then
// @desc Emit an alert after sustained CPU

const d = docker();

d.on("alert", (e) => console.warn(`[${e.rule}] ${e.container.name} cpu=${Number(e.value).toFixed(2)} cores @ ${time(e.at)}`));

d.containers().watch(
  rule("cpu-busy")
    .when(sustained(cpu.is(gt(0.8)), "20s"))
    .then(emit("alert")) // add  c => c.restart()  and run serve --allow-mutations to heal
    .cooldown("2m")
);
console.log("watching every container for 20s of CPU above 0.8 cores (see the Events tab)");
