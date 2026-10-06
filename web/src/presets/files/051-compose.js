// @group Advanced
// @title Composition
// @desc add, mul, div, maxOf

const d = docker();
const all = d.containers();

const cpuPerGB = div(cpu.pipe(pct), mem.pipe(gb)); // % of a core per GB of working set
const saturation = maxOf(cpu, mem.pipe(of("limit"))).pipe(pct); // the tighter resource

console.log("cpu % per GB");
console.log(await all.read(cpuPerGB.pipe(round(1))));
console.log("saturation %");
console.log(await all.read(saturation.pipe(round(1))));
console.log("anything above 80% saturated?", await all.check(saturation.is(gt(80))));
