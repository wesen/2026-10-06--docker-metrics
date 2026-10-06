// @group Alerts
// @title Memory leak watch
// @desc Growth rate rule on the load fleet

// load-leak grows its memory and holds it: a textbook leak.
const d = docker();
const growth = mem.pipe(rate("1m"), mb); // MB per minute
const memPct = mem.pipe(of("limit"), pct);

d.on("leak", (e) => console.warn(`leak suspected: ${e.container.name} (${time(e.at)})`));
d.on("near-limit", (e) => console.error(`${e.container.name} above 60% of its memory limit`));

d.containers("*load-*").watch(
  rule("leak").when(sustained(growth.is(gt(1)), "30s")).then(emit("leak")).cooldown("5m"),
  rule("near-limit").when(memPct.is(gt(60))).then(emit("near-limit")).cooldown("5m")
);

console.log("growth MB/min now:", await d.containers("*load-*").read(growth.pipe(round(1))));
