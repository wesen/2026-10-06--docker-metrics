// @group Streaming
// @title Streaming to the WebSocket hub
// @desc Live frames on topic svc

const d = docker();
d.containers()
  .stream({ cpu: cpu.pipe(pct, avg), mem: mem.pipe(of("limit"), pct, avg) }, { every: "1s" }, by("label:com.docker.compose.project"))
  .to(ws("svc"));
console.log("streaming every 1s on WebSocket topic svc");
