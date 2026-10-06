// @group Alerts
// @title Predicates
// @desc is(), and/or/not, sustained()

const d = docker();
const all = d.containers();

const hot = cpu.is(gt(0.5)); // more than half a core
const bloated = mem.pipe(of("limit")).is(gt(0.5)); // more than half the memory limit
const sick = or(hot, bloated);

console.log("hot now        ", await all.read(hot));
console.log("bloated now    ", await all.read(bloated));
console.log("hot or bloated ", await all.read(sick));
console.log("hot for 30s    ", await all.read(sustained(hot, "30s")));
console.log("anything sick? ", await all.check(sick));
