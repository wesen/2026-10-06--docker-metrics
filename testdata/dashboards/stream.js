// Streaming: one frame per container, tapped to the console.
const d = docker();

d.containers()
  .stream({ cpu: cpu.pipe(pct, avg), mem: mem.pipe(of("limit"), pct, avg) }, { every: "1s" }, by("host"))
  .to(tap((f) => console.log(time(f.t), "frame", JSON.stringify(f.value))));
