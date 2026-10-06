// @group Streaming
// @title Stream a few frames
// @desc take(n) + tap() (goja has no for await)

docker()
  .containers()
  .stream({ cpu: cpu.pipe(pct, avg), mem: mem.pipe(mb, sum) }, { every: "1s" })
  .take(5)
  .to(tap((f) => console.log(time(f.t), "avg cpu", f.value.cpu.toFixed(1) + "%", " total mem", f.value.mem.toFixed(0) + " MB")));
