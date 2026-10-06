// @group Aggregation
// @title Aggregation across a group
// @desc avg, sum, max, p95, count

const d = docker();
const all = d.containers();

console.log("containers      ", await all.read(cpu.pipe(count)));
console.log("avg cpu %       ", await all.read(cpu.pipe(pct, avg)));
console.log("busiest cpu %   ", await all.read(cpu.pipe(pct, max)));
console.log("total mem MB    ", await all.read(mem.pipe(mb, sum)));

// { window } reduces over time first (per container), then across the group.
console.log("p95 cpu % / 5m  ", await all.read(cpu.pipe(pct, p95, { window: "5m" })));
