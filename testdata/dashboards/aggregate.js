// Aggregation across a group, by host and by service label.
const d = docker();

console.log("avg cpu per container");
console.log(JSON.stringify(await d.containers().read(cpu.pipe(avg)), null, 2));

console.log("avg cpu by host");
console.log(JSON.stringify(await d.containers().read(cpu.pipe(avg), by("host")), null, 2));

console.log("memory MB by service");
console.log(JSON.stringify(await d.containers().read(mem.pipe(sum, mb), by("label:service")), null, 2));
