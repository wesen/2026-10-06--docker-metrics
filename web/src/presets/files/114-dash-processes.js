// @group Dashboards · Resources
// @title Processes
// @desc PID counts and PID-limit pressure

const all = docker().containers();
const pidUse = metric("pid-use", (c) => {
  const p = c.read(pids);
  return p && p.limit ? (p.current / p.limit) * 100 : 0;
});

dashboard("Processes", { every: "3s", range: "15m" })
  .row(
    stat("Processes", all, pids.current.pipe(sum)),
    stat("Most in one container", all, pids.current.pipe(max)),
    gauge("Worst PID-limit use", all, pidUse.pipe(max), { unit: "%", warn: gt(50), crit: gt(80), desc: "0 when unlimited" })
  )
  .row(
    line("Processes per container", all, pids.current, { span: 8 }),
    top("Most processes", all, pids.current, { n: 7, span: 4 })
  )
  .row(table("Containers", all, { pids: pids.current, pidUse }, { sort: "pids", columns: { pids: { dec: 0, bar: true }, pidUse: { unit: "%", dec: 2 } } }))
  .show();
