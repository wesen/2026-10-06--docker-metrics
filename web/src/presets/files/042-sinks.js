// @group Streaming
// @title Sinks: Prometheus and tap
// @desc Then open /metrics

const d = docker();
d.containers()
  .stream({ cpu, mem: mem.pipe(mb) }, { every: "2s" })
  .to(prometheus({ prefix: "dock_" }))
  .to(tap((f) => console.log(time(f.t), Object.keys(f.data.cpu).length, "containers exported")));
console.log("curl http://localhost:8080/metrics | grep dock_");
