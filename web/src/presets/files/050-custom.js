// @group Advanced
// @title Custom metrics
// @desc metric(name, c => …) with synchronous c.read()

const d = docker();

// The function is synchronous: c.read() returns the value directly.
const headroomMB = metric("headroom-mb", (c) => (c.read(mem.limit) - c.read(mem)) / 1e6);
const pidUse = metric("pid-use", (c) => {
  const p = c.read(pids);
  return p && p.limit ? p.current / p.limit : 0;
});

console.log("headroom MB", await d.containers().read(headroomMB.pipe(round(0))));
console.log("pid use    ", await d.containers().read(pidUse.pipe(round(4))));
console.log("tightest   ", await d.containers().read(headroomMB.pipe(min, round(0))), "MB");
