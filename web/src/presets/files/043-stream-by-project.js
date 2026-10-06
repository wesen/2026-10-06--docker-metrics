// @group Streaming
// @title Stream grouped frames
// @desc by() inside a stream

docker()
  .containers()
  .stream(cpu.pipe(pct, sum), { every: "2s" }, by("label:com.docker.compose.project"))
  .take(4)
  .to(tap((f) => console.log(time(f.t), JSON.stringify(f.value))));
