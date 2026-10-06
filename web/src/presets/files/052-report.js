// @group Advanced
// @title History report
// @desc history(...).flatten() into a table

const report = await docker()
  .containers()
  .history({ cpu: cpu.pipe(pct, avg), mem: mem.pipe(of("limit"), pct, max) }, last("10m"), bucket("2m"), by("label:com.docker.compose.project"));
console.table(report.flatten());
