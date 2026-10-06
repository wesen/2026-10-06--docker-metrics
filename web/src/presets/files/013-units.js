// @group Basics
// @title Units and derived values
// @desc Pipes: mb, of(), pct, rate()

const d = docker();
const c = d.container(d.containers().names()[0]);

console.log("mem (MB)       ", await c.read(mem.pipe(mb)));
console.log("mem % of limit ", await c.read(mem.pipe(of("limit"), pct)));
console.log("rx bytes/sec   ", await c.read(net.rx.pipe(rate("1s"))));
console.log("tx MB/min      ", await c.read(net.tx.pipe(rate("1m"), mb)));
console.log("disk write KB/s", await c.read(io.w.pipe(rate("1s"), kb)));

// Pipes are values: name them once, reuse them everywhere.
const memPct = mem.pipe(of("limit"), pct, round(1));
console.log("mem % for every container", await d.containers().read(memPct));
