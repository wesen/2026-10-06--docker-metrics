// @group Sandbox
// @title Scratchpad
// @desc Blank page and cheat-sheet

// metrics   cpu  mem  net  io  pids   (+ net.rx net.tx io.r io.w mem.limit pids.current)
// units     mb kb gb pct of("limit") rate("1s") round(n)
// reduce    avg sum min max p50 p95 p99 count  — add { window: "5m" } to reduce over time
// compare   gt gte lt lte eq between  -> metric.is(gt(0.9))
// combine   and or not sustained(pred, "2m")   add sub mul div maxOf minOf
// shape     by("label:com.docker.compose.project")  by("host")  last("15m")  bucket("1m", avg)
// act       rule(name).when(p).then(emit("x")).cooldown("10m")
// stream    group.stream({cpu}, {every:"1s"}).to(ws("topic") | tap(fn) | prometheus())
// dashboard dashboard("t").row(stat(...), line(...), table(...)).show()

const d = docker();
console.log(await d.containers().read(cpu.pipe(pct, avg), by("label:com.docker.compose.project")));
