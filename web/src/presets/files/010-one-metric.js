// @group Basics
// @title One container, one metric
// @desc Read a single number

// cpu is a fraction of ONE core (0.42 = 42% of a core); pct turns it into percent.
const d = docker();
const name = d.containers().names()[0];
const c = d.container(name);

console.log(name);
console.log("cpu       ", await c.read(cpu), "(cores)");
console.log("cpu %     ", await c.read(cpu.pipe(pct)));
console.log("mem bytes ", await c.read(mem), "->", await c.read(mem.pipe(mb)), "MB");
